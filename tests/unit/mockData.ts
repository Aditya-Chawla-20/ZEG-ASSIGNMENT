import type { AnalysisSummary, BreakdownItem, ParcelSummary } from '@/types';

export const mockSummary: AnalysisSummary = {
  parcelAcres: 100.5,
  excludedAcres: 30.25,
  buildableAcres: 70.25,
  buildablePercentage: 69.9,
};

export const mockBreakdown: BreakdownItem[] = [
  {
    constraintType: 'wetlands',
    label: 'Wetlands',
    enabled: true,
    bufferMeters: 30,
    rawIntersectionAcres: 15.5,
    uniquelyRemovedAcres: 15.5,
    percentageOfParcel: 15.4,
    reason: 'Wetland features within 30m buffer of the parcel.',
    sourceDatasetId: 'ds-wetlands-1',
  },
  {
    constraintType: 'floodplain',
    label: 'FEMA Flood Hazard',
    enabled: true,
    bufferMeters: 0,
    rawIntersectionAcres: 20.0,
    uniquelyRemovedAcres: 12.75,
    percentageOfParcel: 12.7,
    reason: 'FEMA flood hazard zones (A, AE) intersecting the parcel.',
    sourceDatasetId: 'ds-flood-1',
  },
  {
    constraintType: 'transmission',
    label: 'Transmission Lines',
    enabled: false,
    bufferMeters: 30,
    rawIntersectionAcres: 5.0,
    uniquelyRemovedAcres: 0,
    percentageOfParcel: 0,
    reason: 'Transmission line constraint disabled by user.',
    sourceDatasetId: 'ds-trans-1',
  },
];

export const mockParcel: ParcelSummary = {
  id: 'parcel-1',
  sourceId: 'src-1',
  displayName: 'Test Parcel A',
  countyName: 'Brazos County',
  address: '123 Test Rd',
  sourceAreaAcres: 100.5,
  centroid: { lon: -96.33, lat: 30.63 },
};
