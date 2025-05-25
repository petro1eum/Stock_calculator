import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders inventory optimizer title', () => {
  render(<App />);
  const titleElement = screen.getByText(/StockOptim/i);
  expect(titleElement).toBeInTheDocument();
});
