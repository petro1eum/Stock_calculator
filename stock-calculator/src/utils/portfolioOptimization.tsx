import { Product } from '../types';
import {
  NormalizedProduct,
  Currency,
  PortfolioConstraints,
  PortfolioAllocation,
  CorrelationRule,
  EfficientFrontierPoint,
  DeliverySchedule
} from '../types/portfolio';
import { blackScholesCall } from './mathFunctions'; 