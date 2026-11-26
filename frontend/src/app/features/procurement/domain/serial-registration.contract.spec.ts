import { describe, expect, it } from 'vitest';
import { parseSerialRegistration, serialRegistration } from './serial-registration.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
describe('Enregistrement des séries', () => {
  it('normalise la saisie et refuse les doublons', () => {
    expect(serialRegistration(' PV-1 \n\nPV-2')).toEqual(['PV-1', 'PV-2']);
    expect(() => serialRegistration('PV-1\nPV-1')).toThrow();
    expect(() => serialRegistration('')).toThrow();
  });
  it('contrôle les numéros et la ligne de réception retournés', () => {
    const response = { count: 1, serials: [{ id, receiptLineId: id, serial: 'PV-1' }] };
    expect(parseSerialRegistration(response, id, ['PV-1'])).toEqual([{ id, serial: 'PV-1' }]);
    expect(() => parseSerialRegistration(response, id, ['PV-2'])).toThrow();
    expect(() => parseSerialRegistration(response, 'other', ['PV-1'])).toThrow();
  });
});
