import { IndexSelectorService } from './index-selector.service';
import { UserRole } from '@haulhub/shared';

describe('IndexSelectorService', () => {
  let service: IndexSelectorService;

  beforeEach(() => {
    service = new IndexSelectorService();
  });

  it('should return GSI4 for Admin', () => {
    const result = service.selectIndex(UserRole.Admin);
    expect(result).toEqual({ indexName: 'GSI4', pkField: 'GSI4PK', pkPrefix: 'ADMIN#' });
  });

  it('should return GSI2 for Dispatcher', () => {
    const result = service.selectIndex(UserRole.Dispatcher);
    expect(result).toEqual({ indexName: 'GSI2', pkField: 'GSI2PK', pkPrefix: 'DISPATCHER#' });
  });

  it('should return GSI1 for Carrier', () => {
    const result = service.selectIndex(UserRole.Carrier);
    expect(result).toEqual({ indexName: 'GSI1', pkField: 'GSI1PK', pkPrefix: 'CARRIER#' });
  });

  it('should return GSI3 for Driver', () => {
    const result = service.selectIndex(UserRole.Driver);
    expect(result).toEqual({ indexName: 'GSI3', pkField: 'GSI3PK', pkPrefix: 'DRIVER#' });
  });
});
