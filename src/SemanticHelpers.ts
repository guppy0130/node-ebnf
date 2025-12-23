import { IToken } from './Parser';

/**
 * Finds all the direct children of a specified type
 */
export function findChildrenByType(token: IToken, type: string) {
  return token.children ? token.children.filter(x => x.type == type) : [];
}
