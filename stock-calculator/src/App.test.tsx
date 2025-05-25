import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders inventory optimizer title', () => {
  render(<App />);
  const titleElement = screen.getByText(/Опционный анализ запаса/i);
  expect(titleElement).toBeInTheDocument();
});
