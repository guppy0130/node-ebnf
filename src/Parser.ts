// https://www.ics.uci.edu/~pattis/ICS-33/lectures/ebnf.pdf

const UPPER_SNAKE_RE = /^[A-Z0-9_]+$/;
const decorationRE = /(\?|\+|\*)$/;
const preDecorationRE = /^(@|&|!)/;
const WS_RULE = 'WS';

import { TokenError } from './TokenError';

export type RulePrimary = string | RegExp;

export interface IRule {
  name: string;
  bnf: RulePrimary[][];
  recover?: string;
  fragment?: boolean;
  pinned?: number;
  implicitWs?: boolean;
  simplifyWhenOneChildren?: boolean;
}

export interface IToken {
  type: string;
  text: string;
  start: number;
  end: number;
  children: IToken[];
  parent: IToken;
  fullText: string;
  errors: TokenError[];
  rest: string;
  fragment?: boolean;
  lookup?: boolean;
}

export function readToken(txt: string, expr: RegExp): IToken {
  const result = expr.exec(txt);

  if (result && result.index == 0) {
    if (result[0].length == 0 && expr.source.length > 0) return null;
    return {
      type: null,
      text: result[0],
      rest: txt.substr(result[0].length),
      start: 0,
      end: result[0].length - 1,
      fullText: result[0],
      errors: [],
      children: [],
      parent: null,
    };
  }

  return null;
}

export function escapeRegExp(str: string) {
  /* eslint no-useless-escape: "off" -- TODO: unwind this */
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
}

function fixRest(token: IToken) {
  token.rest = '';
  token.children.forEach((c) => fixRest(c));
}

function fixPositions(token: IToken, start: number) {
  token.start += start;
  token.end += start;
  token.children.forEach((c) => fixPositions(c, token.start));
}

function aggregateErrors(errors: TokenError[], token: IToken) {
  if (token.errors && token.errors.length) token.errors.forEach((err) => errors.push(err));
  token.children.forEach((tok) => aggregateErrors(errors, tok));
}
export function parseRuleName(name: string) {
  const postDecoration = decorationRE.exec(name);
  const preDecoration = preDecorationRE.exec(name);

  const postDecorationText = (postDecoration && postDecoration[0]) || '';
  const preDecorationText = (preDecoration && preDecoration[0]) || '';

  const out = {
    raw: name,
    name: name.replace(decorationRE, '').replace(preDecorationRE, ''),
    isOptional: postDecorationText == '?' || postDecorationText == '*',
    allowRepetition: postDecorationText == '+' || postDecorationText == '*',
    atLeastOne: postDecorationText == '+',
    lookupPositive: preDecorationText == '&',
    lookupNegative: preDecorationText == '!',
    pinned: preDecorationText == '@',
    lookup: false,
    isLiteral: false,
  };

  out.isLiteral = out.name[0] == "'" || out.name[0] == '"';
  out.lookup = out.lookupNegative || out.lookupPositive;

  return out;
}

export function findRuleByName(name: string, parser: Parser): IRule {
  const parsed = parseRuleName(name);

  return parser.cachedRules[parsed.name] || null;
}

/// Removes all the nodes starting with 'RULE_'
function stripRules(token: IToken, re: RegExp) {
  if (token.children) {
    const localRules = token.children.filter((x) => x.type && re.test(x.type));
    for (let i = 0; i < localRules.length; i++) {
      const indexOnChildren = token.children.indexOf(localRules[i]);
      if (indexOnChildren != -1) {
        token.children.splice(indexOnChildren, 1);
      }
    }

    token.children.forEach((c) => stripRules(c, re));
  }
}

export interface IDictionary<T> {
  [s: string]: T;
}
export interface IParserOptions {
  keepUpperRules: boolean;
  debug: boolean;
}

const ignoreMissingRules = ['EOF'];

export class Parser {
  private readonly debug;

  cachedRules: IDictionary<IRule> = {};
  constructor(public grammarRules: IRule[], public options?: Partial<IParserOptions>) {
    this.debug = options ? options.debug === true : false;
    const errors: string[] = [];

    const neededRules: string[] = [];

    grammarRules.forEach((rule) => {
      const parsedName = parseRuleName(rule.name);

      if (parsedName.name in this.cachedRules) {
        errors.push('Duplicated rule ' + parsedName.name);
        return;
      } else {
        this.cachedRules[parsedName.name] = rule;
      }

      if (!rule.bnf || !rule.bnf.length) {
        const error = 'Missing rule content, rule: ' + rule.name;

        if (errors.indexOf(error) == -1) errors.push(error);
      } else {
        rule.bnf.forEach((options) => {
          if (typeof options[0] === 'string') {
            const parsed = parseRuleName(options[0] as string);
            if (parsed.name == rule.name) {
              const error = 'Left recursion is not allowed, rule: ' + rule.name;

              if (errors.indexOf(error) == -1) errors.push(error);
            }
          }

          options.forEach((option) => {
            if (typeof option == 'string') {
              const name = parseRuleName(option);
              if (
                !name.isLiteral &&
                neededRules.indexOf(name.name) == -1 &&
                ignoreMissingRules.indexOf(name.name) == -1
              )
                neededRules.push(name.name);
            }
          });
        });
      }

      if (WS_RULE == rule.name) rule.implicitWs = false;

      if (rule.implicitWs) {
        if (neededRules.indexOf(WS_RULE) == -1) neededRules.push(WS_RULE);
      }

      if (rule.recover) {
        if (neededRules.indexOf(rule.recover) == -1) neededRules.push(rule.recover);
      }
    });

    neededRules.forEach((ruleName) => {
      if (!(ruleName in this.cachedRules)) {
        errors.push('Missing rule ' + ruleName);
      }
    });

    if (errors.length) throw new Error(errors.join('\n'));
  }

  getAST(txt: string, target?: string) {
    if (!target) {
      target = this.grammarRules.filter((x) => !x.fragment && x.name.indexOf('%') != 0)[0].name;
    }

    const result = this.parse(txt, target);

    if (result) {
      aggregateErrors(result.errors, result);
      fixPositions(result, 0);

      // REMOVE ALL THE TAGS MATCHING /^%/
      stripRules(result, /^%/);

      if (!this.options || !this.options.keepUpperRules) stripRules(result, UPPER_SNAKE_RE);

      const rest = result.rest;

      if (rest) {
        new TokenError('Unexpected end of input: \n' + rest, result);
      }

      fixRest(result);

      result.rest = rest;
    }

    return result;
  }

  emitSource(): string {
    return 'CANNOT EMIT SOURCE FROM BASE Parser';
  }

  parse(txt: string, target: string, recursion = 0): IToken {
    let out: IToken = null;

    const type = parseRuleName(target);

    let expr: RegExp;

    const printable = this.debug && /*!isLiteral &*/ !UPPER_SNAKE_RE.test(type.name);

    if (printable) {
      console.log(
        new Array(recursion).join('│  ') + 'Trying to get ' + target + ' from ' + JSON.stringify(txt.split('\n')[0])
      );
    }

    let realType = type.name;

    const targetLex = findRuleByName(type.name, this);

    if (type.name == 'EOF') {
      if (txt.length) {
        return null;
      } else if (txt.length == 0) {
        return {
          type: 'EOF',
          text: '',
          rest: '',
          start: 0,
          end: 0,
          fullText: '',
          errors: [],
          children: [],
          parent: null,
        };
      }
    }

    try {
      if (!targetLex && type.isLiteral) {
        let src: string = type.name.trim();

        if (src.startsWith('"')) {
          src = JSON.parse(src);
        } else if (src.startsWith("'")) {
          src = src.replace(/^'(.+)'$/, '$1').replace(/\\'/g, "'");
        }

        if (src === '') {
          return {
            type: '%%EMPTY%%',
            text: '',
            rest: txt,
            start: 0,
            end: 0,
            fullText: '',
            errors: [],
            children: [],
            parent: null,
          };
        }

        expr = new RegExp(escapeRegExp(src));
        realType = null;
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        console.error(e);
      }
      return null;
    }

    if (expr) {
      const result = readToken(txt, expr);

      if (result) {
        result.type = realType;
        return result;
      }
    } else {
      const options = targetLex.bnf;

      if (options instanceof Array) {
        options.forEach((phases) => {
          if (out) return;

          let pinned: IToken = null;

          const tmp: IToken = {
            type: type.name,
            text: '',
            children: [],
            end: 0,
            errors: [],
            fullText: '',
            parent: null,
            start: 0,
            rest: txt,
          };

          if (targetLex.fragment) tmp.fragment = true;

          let tmpTxt = txt;
          let position = 0;

          let allOptional = phases.length > 0;
          let foundSomething = false;

          for (let i = 0; i < phases.length; i++) {
            if (typeof phases[i] == 'string') {
              const localTarget = parseRuleName(phases[i] as string);

              allOptional = allOptional && localTarget.isOptional;

              let got: IToken;

              let foundAtLeastOne = false;

              do {
                got = null;

                if (targetLex.implicitWs) {
                  got = this.parse(tmpTxt, localTarget.name, recursion + 1);

                  if (!got) {
                    let WS: IToken;

                    do {
                      WS = this.parse(tmpTxt, WS_RULE, recursion + 1);

                      if (WS) {
                        tmp.text = tmp.text + WS.text;
                        tmp.end = tmp.text.length;

                        WS.parent = tmp;
                        tmp.children.push(WS);

                        tmpTxt = tmpTxt.substr(WS.text.length);
                        position += WS.text.length;
                      } else {
                        break;
                      }
                    } while (WS && WS.text.length);
                  }
                }

                got = got || this.parse(tmpTxt, localTarget.name, recursion + 1);

                // rule ::= "true" ![a-zA-Z]
                // negative lookup, if it does not match, we should continue
                if (localTarget.lookupNegative) {
                  if (got) return /* cancel this path */;
                  break;
                }

                if (localTarget.lookupPositive) {
                  if (!got) return;
                }

                if (!got) {
                  if (localTarget.isOptional) break;
                  if (localTarget.atLeastOne && foundAtLeastOne) break;
                }

                if (got && targetLex.pinned == i + 1) {
                  pinned = got;
                  if (printable) {
                    console.log(new Array(recursion + 1).join('│  ') + '└─ ' + got.type + ' PINNED');
                  }
                }

                if (!got) got = this.parseRecovery(targetLex, tmpTxt, recursion + 1);

                if (!got) {
                  if (pinned) {
                    out = tmp;
                    got = {
                      type: 'SyntaxError',
                      text: tmpTxt,
                      children: [],
                      end: tmpTxt.length,
                      errors: [],
                      fullText: '',
                      parent: null,
                      start: 0,
                      rest: '',
                    };
                    if (tmpTxt.length) {
                      new TokenError(`Unexpected end of input. Expecting ${localTarget.name} Got: ${tmpTxt}`, got);
                    } else {
                      new TokenError(`Unexpected end of input. Missing ${localTarget.name}`, got);
                    }
                    if (printable) {
                      console.log(
                        new Array(recursion + 1).join('│  ') + '└─ ' + got.type + ' ' + JSON.stringify(got.text)
                      );
                    }
                  } else {
                    return;
                  }
                }

                foundAtLeastOne = true;
                foundSomething = true;

                if (got.type == '%%EMPTY%%') {
                  break;
                }

                got.start += position;
                got.end += position;

                if (!localTarget.lookupPositive && got.type) {
                  if (got.fragment) {
                    got.children.forEach((x) => {
                      x.start += position;
                      x.end += position;
                      x.parent = tmp;
                      tmp.children.push(x);
                    });
                  } else {
                    got.parent = tmp;
                    tmp.children.push(got);
                  }
                }

                if (localTarget.lookup) got.lookup = true;

                if (printable) {
                  console.log(new Array(recursion + 1).join('│  ') + '└─ ' + got.type + ' ' + JSON.stringify(got.text));
                }

                // Eat it from the input stream, only if it is not a lookup
                if (!localTarget.lookup && !got.lookup) {
                  tmp.text = tmp.text + got.text;
                  tmp.end = tmp.text.length;

                  tmpTxt = tmpTxt.substr(got.text.length);
                  position += got.text.length;
                }

                tmp.rest = tmpTxt;
              } while (got && localTarget.allowRepetition && tmpTxt.length && !got.lookup);
            } /* IS A REGEXP */ else {
              const got = readToken(tmpTxt, phases[i] as RegExp);

              if (!got) {
                return;
              }

              if (printable) {
                console.log(
                  new Array(recursion + 1).join('│  ') + '└> ' + JSON.stringify(got.text) + (phases[i] as RegExp).source
                );
              }

              foundSomething = true;

              got.start += position;
              got.end += position;

              tmp.text = tmp.text + got.text;
              tmp.end = tmp.text.length;

              tmpTxt = tmpTxt.substr(got.text.length);
              position += got.text.length;

              tmp.rest = tmpTxt;
            }
          }

          if (foundSomething) {
            out = tmp;

            if (printable) {
              console.log(
                new Array(recursion).join('│  ') + '├<─┴< PUSHING ' + out.type + ' ' + JSON.stringify(out.text)
              );
            }
          }
        });
      }

      if (out && targetLex.simplifyWhenOneChildren && out.children.length == 1) {
        out = out.children[0];
      }
    }

    if (!out && printable) {
      console.log(target + ' NOT RESOLVED FROM ' + txt);
    }

    return out;
  }

  private parseRecovery(recoverableToken: IRule, tmpTxt: string, recursion: number): IToken {
    if (recoverableToken.recover && tmpTxt.length) {
      const printable = this.debug;

      if (printable) {
        console.log(
          new Array(recursion + 1).join('│  ') +
          'Trying to recover until token ' +
          recoverableToken.recover +
          ' from ' +
          JSON.stringify(tmpTxt.split('\n')[0] + tmpTxt.split('\n')[1])
        );
      }

      const tmp: IToken = {
        type: 'SyntaxError',
        text: '',
        children: [],
        end: 0,
        errors: [],
        fullText: '',
        parent: null,
        start: 0,
        rest: '',
      };

      let got: IToken;

      do {
        got = this.parse(tmpTxt, recoverableToken.recover, recursion + 1);

        if (got) {
          new TokenError('Unexpected input: "' + tmp.text + `" Expecting: ${recoverableToken.name}`, tmp);
          break;
        } else {
          tmp.text = tmp.text + tmpTxt[0];
          tmp.end = tmp.text.length;
          tmpTxt = tmpTxt.substr(1);
        }
      } while (!got && tmpTxt.length > 0);

      if (tmp.text.length > 0 && got) {
        if (printable) {
          console.log(new Array(recursion + 1).join('│  ') + 'Recovered text: ' + JSON.stringify(tmp.text));
        }
        return tmp;
      }
    }
    return null;
  }
}

export default Parser;
