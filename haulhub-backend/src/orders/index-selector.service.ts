import { Injectable } from '@nestjs/common';
import { UserRole } from '@haulhub/shared';

export interface IndexSelection {
  indexName: string;
  pkField: string;
  pkPrefix: string;
}

@Injectable()
export class IndexSelectorService {
  selectIndex(role: UserRole): IndexSelection {
    switch (role) {
      case UserRole.Admin:
        return { indexName: 'GSI4', pkField: 'GSI4PK', pkPrefix: 'ADMIN#' };
      case UserRole.Dispatcher:
        return { indexName: 'GSI2', pkField: 'GSI2PK', pkPrefix: 'DISPATCHER#' };
      case UserRole.Carrier:
        return { indexName: 'GSI1', pkField: 'GSI1PK', pkPrefix: 'CARRIER#' };
      case UserRole.Driver:
        return { indexName: 'GSI3', pkField: 'GSI3PK', pkPrefix: 'DRIVER#' };
    }
  }
}
