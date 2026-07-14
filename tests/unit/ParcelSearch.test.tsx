import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ParcelSearch } from '@/features/parcels/ParcelSearch';
import { useAppStore } from '@/stores/appStore';
import * as api from '@/api/client';

vi.mock('@/api/client', () => ({
  searchParcels: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ParcelSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store
    useAppStore.setState({ selectedParcelId: null });
  });

  it('renders the search input', () => {
    renderWithProviders(<ParcelSearch />);
    expect(screen.getByTestId('parcel-search-input')).toBeInTheDocument();
  });

  it('renders demo parcel quick-select buttons', () => {
    renderWithProviders(<ParcelSearch />);
    expect(screen.getByTestId('demo-parcel-DEMO-PARCEL-A')).toBeInTheDocument();
    expect(screen.getByTestId('demo-parcel-DEMO-PARCEL-B')).toBeInTheDocument();
    expect(screen.getByTestId('demo-parcel-DEMO-PARCEL-C')).toBeInTheDocument();
  });

  it('selects a demo parcel on click', async () => {
    vi.mocked(api.searchParcels).mockResolvedValue({
      items: [{ id: 'uuid-a', sourceId: 'DEMO-PARCEL-A', displayName: 'Demo Parcel A', countyName: 'Brazos', address: null, sourceAreaAcres: 5, centroid: { lon: -96.33, lat: 30.63 } }],
      total: 1, limit: 5, offset: 0,
    });
    renderWithProviders(<ParcelSearch />);
    fireEvent.click(screen.getByTestId('demo-parcel-DEMO-PARCEL-A'));
    await waitFor(() => {
      expect(useAppStore.getState().selectedParcelId).toBe('uuid-a');
    });
  });

  it('calls onSelect when a demo parcel is chosen', async () => {
    const onSelect = vi.fn();
    vi.mocked(api.searchParcels).mockResolvedValue({
      items: [{ id: 'uuid-b', sourceId: 'DEMO-PARCEL-B', displayName: 'Demo Parcel B', countyName: 'Brazos', address: null, sourceAreaAcres: 12, centroid: { lon: -96.35, lat: 30.61 } }],
      total: 1, limit: 5, offset: 0,
    });
    renderWithProviders(<ParcelSearch onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('demo-parcel-DEMO-PARCEL-B'));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('uuid-b');
    });
  });

  it('shows search results when typing and API returns items', async () => {
    const mockItems = [
      {
        id: 'p-1',
        sourceId: 's-1',
        displayName: 'North Brazos 40',
        countyName: 'Brazos County',
        address: null,
        sourceAreaAcres: 40.0,
        centroid: { lon: -96.3, lat: 30.6 },
      },
    ];
    vi.mocked(api.searchParcels).mockResolvedValue({
      items: mockItems,
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<ParcelSearch />);
    const input = screen.getByTestId('parcel-search-input');
    fireEvent.change(input, { target: { value: 'Brazos' } });

    await waitFor(() => {
      expect(screen.getByText('North Brazos 40')).toBeInTheDocument();
    });
  });

  it('selects a parcel from the dropdown', async () => {
    const mockItems = [
      {
        id: 'p-99',
        sourceId: 's-99',
        displayName: 'South College Station 10',
        countyName: 'Brazos County',
        address: '456 Farm Rd',
        sourceAreaAcres: 10.0,
        centroid: { lon: -96.31, lat: 30.62 },
      },
    ];
    vi.mocked(api.searchParcels).mockResolvedValue({
      items: mockItems,
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<ParcelSearch />);
    fireEvent.change(screen.getByTestId('parcel-search-input'), {
      target: { value: 'College' },
    });

    await waitFor(() => {
      expect(screen.getByText('South College Station 10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('South College Station 10'));
    expect(useAppStore.getState().selectedParcelId).toBe('p-99');
  });
});
