/** Future optional connector contract, not a live network implementation.
 * Only authorized dataset metadata/export reads are represented.
 */
export interface DomoCaptureContext {
  datasetId: string;
  authenticatedSubject: string;
  completeness: 'complete' | 'filtered' | 'sample' | 'unknown';
  permissionNotes: string[];
}
export interface DomoDatasetDescription {
  id: string;
  name: string;
  sourceUpdatedAt?: string;
}
export interface DomoReadOnlySource {
  describeDataset(datasetId: string, signal?: AbortSignal): Promise<DomoDatasetDescription>;
  exportCsv(context: DomoCaptureContext, signal?: AbortSignal): AsyncIterable<Uint8Array>;
}
