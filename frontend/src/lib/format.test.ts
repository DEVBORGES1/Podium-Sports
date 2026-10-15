import { describe, expect, it } from 'vitest';
import { brl, centsToInput, formatPhone, maskPhone, normalize, parseMoneyToCents } from './format';

const clean = (s: string) => s.replace(/\u00a0/g, ' ');

describe('formatação', () => {
  it('formata centavos como reais', () => {
    expect(clean(brl(39_990))).toBe('R$ 399,90');
    expect(clean(brl(141_790))).toBe('R$ 1.417,90');
  });
  it('converte texto em centavos sem ponto flutuante acumulado', () => {
    expect(parseMoneyToCents('399,90')).toBe(39_990);
    expect(parseMoneyToCents('1.417,90')).toBe(141_790);
    expect(parseMoneyToCents('0,1')).toBe(10);
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('-5')).toBeNull();
    expect(centsToInput(1005)).toBe('10,05');
  });
  it('telefones e busca sem acentos', () => {
    expect(formatPhone('5549999991234')).toBe('(49) 99999-1234');
    expect(maskPhone('4999999')).toBe('(49) 9999-9');
    expect(normalize('Pré-treino HÓRUS')).toBe('pre-treino horus');
  });
});
