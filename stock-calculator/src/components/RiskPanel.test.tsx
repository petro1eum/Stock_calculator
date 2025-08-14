import React from 'react';
import { render, screen } from '@testing-library/react';
import RiskPanel from './RiskPanel';

const makeProduct = (over: Partial<any> = {}) => ({
  sku: 'TEST',
  purchase: 100,
  margin: 50,
  muWeek: 10,
  sigmaWeek: 5,
  salesHistory: [],
  ...over,
});

describe('RiskPanel', () => {
  it('renders base structure', () => {
    render(<RiskPanel products={[makeProduct()]} confidence={0.95} />);
    expect(screen.getByText(/RISK \(95%\)/i)).toBeInTheDocument();
    expect(screen.getByText('VaR:')).toBeInTheDocument();
    expect(screen.getByText('ES:')).toBeInTheDocument();
  });

  it('uses scenarios when provided', () => {
    render(
      <RiskPanel
        products={[makeProduct()]}
        confidence={0.95}
        scenarios={[{ probability: 1, muWeekMultiplier: 1, sigmaWeekMultiplier: 1 }] as any}
      />
    );
    expect(screen.getByText(/Источник: смесь сценариев/i)).toBeInTheDocument();
  });
});


