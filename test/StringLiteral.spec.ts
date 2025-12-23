import { Grammars, Parser } from '../src';
import { findRuleByName } from '../src/Parser';
import { testParseToken, testParseTokenFailsafe } from './TestHelpers';
import { describe, it, expect } from 'bun:test';
import { inspect } from 'util';

const grammar = `

Document          ::= Keyword1 | Keyword2

Keyword1          ::= 'And' | 'Or'
Keyword2          ::= 'Not' | 'Is' {ignoreCase=true}

`;

describe('String Literals', () => {
  describe('Parse JSON', () => {
    let parser: Parser;

    describe('create parser', () => {
      parser = new Parser(Grammars.Custom.RULES, {});
      testParseToken(parser, grammar);
    });
  });

  describe('Grammars.Custom parses JSON grammar', function() {
    const RULES = Grammars.Custom.getRules(grammar);
    console.log('JSON:\n' + inspect(RULES, false, 20, true));
    const parser = new Parser(RULES, {});

    it('string literal case sensitive rule', () => {
       const rule = findRuleByName("Keyword1", parser);

       console.log(rule.bnf[0]);

       expect(rule.bnf[0][0]).toEqual(RegExp('A'));
       expect(rule.bnf[0][1]).toEqual(RegExp('n'));
       expect(rule.bnf[0][2]).toEqual(RegExp('d'));

       console.log(rule.bnf[1]);

       expect(rule.bnf[1][0]).toEqual(RegExp('O'));
       expect(rule.bnf[1][1]).toEqual(RegExp('r'));
    });

    testParseTokenFailsafe(parser, 'And');
    testParseTokenFailsafe(parser, 'Or');

    it('string literal case sensitive rule - OR', () => {
       expect(parser.getAST('OR')).toEqual(null);
    });

    it('string literal case insensitive rule', () => {
       const rule = findRuleByName("Keyword2", parser);

       console.log(rule.bnf[0]);

       expect(rule.bnf[0][0]).toEqual(RegExp('[Nn]'));
       expect(rule.bnf[0][1]).toEqual(RegExp('[Oo]'));
       expect(rule.bnf[0][2]).toEqual(RegExp('[Tt]'));

       console.log(rule.bnf[1]);

       expect(rule.bnf[1][0]).toEqual(RegExp('[Ii]'));
       expect(rule.bnf[1][1]).toEqual(RegExp('[Ss]'));
    });

    testParseTokenFailsafe(parser, 'is');
    testParseTokenFailsafe(parser, 'IS');
    testParseTokenFailsafe(parser, 'NoT');
    testParseTokenFailsafe(parser, 'not');
    testParseTokenFailsafe(parser, 'NOT');
  });
});
