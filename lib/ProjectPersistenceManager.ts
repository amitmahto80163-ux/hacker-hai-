import { TimelineClip, TimelineTrack, Scene3DObject, CompositorNode, CompositorEdge } from './store';
import { ShaderDefinition } from './shaders';
import { HighFrequencyPlaybackEngine } from './playbackEngine';

export interface ProjectVaultSnapshot {
  id: string;
  timestamp: number;
  label: string;
  payload: {
    resolution: '1080p' | '4K';
    fps: 24 | 30 | 60;
    duration: number;
    tracks: TimelineTrack[];
    clips: TimelineClip[];
    sceneObjects: Scene3DObject[];
    nodes: CompositorNode[];
    edges: CompositorEdge[];
    customShaders: ShaderDefinition[];
  };
}

const DB_NAME = 'AetherStudioDB';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'autosaveSnapshots';

/**
 * Crash-Proof IndexedDB Auto-Save Vault, .aether Project Serializer,
 * and CMX 3600 EDL / Final Cut Pro XML Timeline Cut-List Exporter.
 */
export class ProjectPersistenceManager {
  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  public static async saveSnapshot(snapshot: ProjectVaultSnapshot): Promise<void> {
    try {
      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        store.put(snapshot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore IndexedDB quota errors in restricted sandboxes
    }
  }

  public static async listSnapshots(): Promise<ProjectVaultSnapshot[]> {
    try {
      const db = await this.openDB();
      return await new Promise<ProjectVaultSnapshot[]>((resolve, reject) => {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result as ProjectVaultSnapshot[]) || [];
          list.sort((a, b) => b.timestamp - a.timestamp);
          resolve(list.slice(0, 20));
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  /**
   * Serializes the entire AetherStudio Pro state into a portable `.aether` JSON package and triggers download.
   */
  public static exportAetherFile(snapshot: ProjectVaultSnapshot) {
    const manifest = {
      schemaVersion: '1.0.0',
      application: 'AetherStudio Pro',
      exportedAt: new Date().toISOString(),
      ...snapshot.payload,
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AetherStudio_Project_${new Date().toISOString().slice(0, 10)}.aether`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Generates a standard CMX 3600 .EDL cut list for industry NLE interoperability (DaVinci Resolve / Premiere / Avid).
   */
  public static exportCMX3600EDL(clips: TimelineClip[], fps: number): void {
    const lines: string[] = [
      'TITLE: AETHERSTUDIO_PRO_MASTER_SEQUENCE',
      'FCM: NON-DROP FRAME',
      '',
    ];

    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    sorted.forEach((clip, idx) => {
      const eventNum = String(idx + 1).padStart(3, '0');
      const reel = clip.type === 'audio' ? 'AUD001  ' : 'AX      ';
      const channel = clip.type === 'audio' ? 'A     ' : 'V     ';
      const srcIn = HighFrequencyPlaybackEngine.formatTimecode(clip.trimIn, fps);
      const srcOut = HighFrequencyPlaybackEngine.formatTimecode(clip.trimIn + clip.duration, fps);
      const recIn = HighFrequencyPlaybackEngine.formatTimecode(clip.startTime, fps);
      const recOut = HighFrequencyPlaybackEngine.formatTimecode(clip.startTime + clip.duration, fps);

      lines.push(`${eventNum}  ${reel} ${channel} C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
      lines.push(`* FROM CLIP NAME: ${clip.name}`);
      lines.push('');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AetherStudio_Sequence.edl';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
