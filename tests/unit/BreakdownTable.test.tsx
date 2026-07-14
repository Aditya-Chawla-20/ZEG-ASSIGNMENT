import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BreakdownTable } from '@/features/analysis/BreakdownTable';
import { mockBreakdown } from './mockData';

describe('BreakdownTable', () => {
  it('renders all breakdown rows', () => {
    render(<BreakdownTable items={mockBreakdown} isLoading={false} />);

    expect(screen.getByText('Wetlands')).toBeInTheDocument();
    expect(screen.getByText('FEMA Flood Hazard')).toBeInTheDocument();
    expect(screen.getByText('Transmission Lines')).toBeInTheDocument();
  });

  it('shows buffer distances with meters', () => {
    render(<BreakdownTable items={mockBreakdown} isLoading={false} />);

    // Wetlands buffer is 30m, Transmission is also 30m -> 2 occurrences
    expect(screen.getAllByText('30 m')).toHaveLength(2);
    // Floodplain buffer is 0 -> N/A
    expect(screen.getAllByText('N/A')).toHaveLength(1);
  });

  it('shows unique removed acres', () => {
    render(<BreakdownTable items={mockBreakdown} isLoading={false} />);

    expect(screen.getByText('15.50')).toBeInTheDocument();
    expect(screen.getByText('12.75')).toBeInTheDocument();
  });

  it('shows percentage of parcel', () => {
    render(<BreakdownTable items={mockBreakdown} isLoading={false} />);

    expect(screen.getByText('15.4%')).toBeInTheDocument();
    expect(screen.getByText('12.7%')).toBeInTheDocument();
  });

  it('renders skeleton loaders when loading', () => {
    const { container } = render(<BreakdownTable items={[]} isLoading={true} />);

    expect(container.querySelector('[data-testid="breakdown-table"]')).toBeNull();
    expect(container.querySelectorAll('.animate-pulse-subtle').length).toBeGreaterThan(0);
  });

  it('shows empty state when no items', () => {
    render(<BreakdownTable items={[]} isLoading={false} />);

    expect(screen.getByText(/No breakdown available/i)).toBeInTheDocument();
  });

  it('shows the unique attribution note', () => {
    render(<BreakdownTable items={mockBreakdown} isLoading={false} />);

    expect(
      screen.getByText(/uniquely attributed in priority order/i),
    ).toBeInTheDocument();
  });

  it('strikethrough disabled constraints', () => {
    render(<BreakdownTable items={mockBreakdown} isLoading={false} />);

    // Transmission is disabled -> label has line-through
    const transLabel = screen.getByText('Transmission Lines');
    expect(transLabel.className).toContain('line-through');
  });
});
