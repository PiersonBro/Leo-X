import { render, screen } from '@testing-library/react';
import App from './App';

test('renders prediction market component', () => {
  render(<App />);
  // The component shows a loading state initially
  const loadingElement = screen.getByText(/Loading markets.../i);
  expect(loadingElement).toBeInTheDocument();
});
