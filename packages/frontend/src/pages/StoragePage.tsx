import { useState } from 'react';
import { HardDrive, Link2 } from 'lucide-react';
import { PageHeader } from '../layout';
import { Button } from '../ui';
import { api, ApiError } from '../lib/api';
import { toast } from '../stores/toast';
import { FileBrowser } from '../components/FileBrowser';
import { FileSystemBrowserModal } from '../components/FileSystemBrowserModal';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const enc = encodeURIComponent;

const storageEndpoints = {
  list: (dirPath: string) => `/storage?path=${enc(dirPath)}`,
  createFolder: '/storage/folders',
  upload: '/storage/upload',
  download: (filePath: string) => `/storage/download?path=${enc(filePath)}`,
  delete: (entryPath: string) => `/storage?path=${enc(entryPath)}`,
  reveal: '/storage/reveal',
  rename: '/storage/rename',
};

export function StoragePage() {
  useDocumentTitle('Storage');
  const [showFsBrowser, setShowFsBrowser] = useState(false);
  const [refKey, setRefKey] = useState(0);

  async function handleCreateReference(targetPath: string) {
    const name = targetPath.split('/').filter(Boolean).pop();
    if (!name) return;
    setShowFsBrowser(false);
    try {
      await api('/storage/references', {
        method: 'POST',
        body: JSON.stringify({ path: '/', name, target: targetPath }),
      });
      toast.success('Reference created');
      // Force FileBrowser to re-fetch by changing key
      setRefKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create reference');
    }
  }

  return (
    <>
      <PageHeader
        title="Storage"
        description="Browse, upload, and manage files"
      />
      <FileBrowser
        key={refKey}
        endpoints={storageEndpoints}
        rootLabel="Storage"
        rootIcon={HardDrive}
        showMultiSelect
        showRename
        extraToolbarButtons={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowFsBrowser(true)}
          >
            <Link2 size={14} />
            Reference
          </Button>
        }
      />

      {showFsBrowser && (
        <FileSystemBrowserModal
          onSelect={handleCreateReference}
          onClose={() => setShowFsBrowser(false)}
        />
      )}
    </>
  );
}
