import { BadRequestException } from '@nestjs/common';
import { TreasuryPort } from './treasury.port';
import { TreasuryService } from './treasury.service';

describe('TreasuryService', () => {
  const repository: jest.Mocked<TreasuryPort> = {
    list: jest.fn(),
    create: jest.fn(),
    open: jest.fn(),
    move: jest.fn(),
    close: jest.fn(),
    transfer: jest.fn(),
    reverse: jest.fn(),
    reconcile: jest.fn(),
    summary: jest.fn(),
  };
  const service = new TreasuryService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('refuse les transferts nuls, négatifs ou vers la même caisse', () => {
    expect(() => service.transfer('a', 'a', '100', 'key', 'actor')).toThrow(BadRequestException);
    expect(() => service.transfer('a', 'b', '0', 'key', 'actor')).toThrow(BadRequestException);
    expect(() => service.transfer('a', 'b', '-1', 'key', 'actor')).toThrow(BadRequestException);
    expect(repository.transfer).not.toHaveBeenCalled();
  });

  it('transmet le montant décimal sans conversion', () => {
    service.transfer('a', 'b', '123.45', 'key', 'actor');
    expect(repository.transfer).toHaveBeenCalledWith('a', 'b', '123.45', 'key', 'actor');
  });

  it('refuse les montants trop précis', () => {
    expect(() => service.open('a', '1.001', 'actor')).toThrow(BadRequestException);
    expect(repository.open).not.toHaveBeenCalled();
  });

  it('exige un motif de contrepassation', () => {
    expect(() => service.reverse('id', ' ', 'key', 'actor')).toThrow(BadRequestException);
    expect(repository.reverse).not.toHaveBeenCalled();
  });
});
