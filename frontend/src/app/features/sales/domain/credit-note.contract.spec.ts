import { describe, expect, it } from 'vitest';
import { parseCreditPreview, verifyIssuedCredit } from './credit-note.contract';
const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const lines = [{ invoiceLineId: id, netAmount: '50.00' }];
const preview = { invoiceId: id, amount: '59.00', netAmount: '50.00', taxAmount: '9.00', available: '118.00',
  lines: [{ ...lines[0], taxAmount: '9.00' }] };
describe('Avoirs clients', () => {
  it('vérifie la ventilation du serveur et refuse une divergence fiscale', () => {
    expect(parseCreditPreview(preview, id, lines).amount).toBe('59.00');
    expect(() => parseCreditPreview({ ...preview, taxAmount: '9.01' }, id, lines)).toThrow();
    expect(() => parseCreditPreview({ ...preview, available: '58.99' }, id, lines)).toThrow();
  });
  it('vérifie la référence et la ventilation de l’avoir rejoué', () => {
    const command = { operationKey: id, amount: '59.00', reason: 'Correction de prix', lines };
    const note = { ...preview, id, number: 'AV-' + id.toUpperCase(), reason: command.reason, issuedAt: '2026-11-26T00:00:00Z',
      lines: [{ invoiceLineId: id, netAmount: '50', taxAmount: '9', creditNoteId: id }] };
    expect(verifyIssuedCredit(note, id, command).id).toBe(id);
    expect(() => verifyIssuedCredit({ ...note, number: 'AV-AUTRE' }, id, command)).toThrow();
  });
});
