import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryCards } from '@/features/analysis/SummaryCards';
import { mockSummary } from './mockData';

describe('SummaryCards', () => {
  it('renders all four stat cards', () => {
    render(<SummaryCards summary={mockSummary} isLoading={false} />);

    expect(screen.getByText('Parcel')).toBeInTheDocument();
    expect(screen.getByText('Excluded')).toBeInTheDocument();
    expect(screen.getByText('Buildable')).toBeInTheDocument();
    expect(screen.getByText('Buildable %')).toBeInTheDocument();
  });

  it('formats acreage values correctly', () => {
    render(<SummaryCards summary={mockSummary} isLoading={false} />);

    expect(screen.getByText('100.50 ac')).toBeInTheDocument();
    expect(screen.getByText('30.25 ac')).toBeInTheDocument();
    expect(screen.getByText('70.25 ac')).toBeInTheDocument();
  });

  it('formats percentage correctly', () => {
    render(<SummaryCards summary={mockSummary} isLoading={false} />);

    expect(screen.getAllByText('69.9%').length).toBeGreaterThan(0);
  });

  it('shows skeleton loaders when loading', () => {
    const { container } = render(<SummaryCards summary={null} isLoading={true} />);

    expect(container.querySelectorAll('.animate-pulse-subtle').length).toBe(4);
  });

  it('shows skeleton loaders when summary is null and not loading', () => {
    const { container } = render(<SummaryCards summary={null} isLoading={true} />);

    expect(container.querySelectorAll('.animate-pulse-subtle').length).toBe(4);
  });

  it('renders test ids for each card', () => {
    render(<SummaryCards summary={mockSummary} isLoading={false} />);

    expect(screen.getByTestId('summary-card-parcel')).toBeInTheDocument();
    expect(screen.getByTestId('summary-card-excluded')).toBeInTheDocument();
    expect(screen.getByTestId('summary-card-buildable')).toBeInTheDocument();
    expect(screen.getByTestId('summary-card-pct')).toBeInTheDocument();
  });

  it('uses amber color for low buildable percentage', () => {
    const lowSummary = { ...mockSummary, buildablePercentage: 25.0 };
    render(<SummaryCards summary={lowSummary} isLoading={false} />);

    const pctCard = screen.getByTestId('summary-card-pct');
    const value = pctCard.querySelector('.text-floodplain-700');
    expect(value).not.toBeNull();
  });

  it('uses green color for high buildable percentage', () => {
    const highSummary = { ...mockSummary, buildablePercentage: 85.0 };
    render(<SummaryCards summary={highSummary} isLoading={false} />);

    const pctCard = screen.getByTestId('summary-card-pct');
    const value = pctCard.querySelector('.text-buildable-700');
    expect(value).not.toBeNull();
  });
});
