import { describe, expect, test } from 'vitest';

import { explanationLines } from '../../../src/lib/explanation';

describe('explanationLines', () => {
  test('reads an explanation as lines of plain text, ending one at each break and block, leaving out scripts', () => {
    expect(
      explanationLines('<p>Not <b>verified</b></p><ul><li>For 14</li><li> </li></ul>Then<br>after<script>x</script>'),
    ).toEqual(['Not verified', 'For 14', 'Then', 'after']);
  });

  test('gives no lines for no explanation', () => {
    expect(explanationLines('')).toEqual([]);
  });
});
