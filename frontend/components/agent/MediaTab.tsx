'use client';

import { useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { Card, Button } from '@/components/ui';
import type { AgentMedia, MediaConfig } from '@/lib/types';

// Image compression options
const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,           // Target max size
  maxWidthOrHeight: 1920, // Resize if bigger
  useWebWorker: true,     // Use web worker for better performance
  fileType: 'image/jpeg'  // Convert to JPEG for smaller size
};

interface MediaTabProps {
  media: AgentMedia[];
  mediaConfig: MediaConfig | null;
  onUpload: (file: File, data: MediaUploadInput, onProgress: (p: number) => void) => Promise<void>;
  onUpdate: (mediaId: number, data: MediaUpdateInput) => Promise<void>;
  onDelete: (mediaId: number) => Promise<void>;
  onConfigChange: (config: MediaConfig) => void;
  onSaveConfig: () => Promise<void>;
  saving: boolean;
  canUpload?: boolean;
  canEdit?: boolean;
  canShowConfig?: boolean;
}

interface MediaUploadInput {
  name?: string;
  media_type: 'image' | 'video' | 'document';
  description?: string;
  default_caption?: string;
  display_filename?: string;
  original_size?: number;
}

interface MediaUpdateInput {
  name?: string;
  description?: string;
  default_caption?: string;
  filename?: string;
  is_active?: boolean;
}

type Section = 'images' | 'videos' | 'documents' | 'settings';

const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain'
];

const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25MB

const DEFAULT_CONFIG: MediaConfig = {
  enabled: false,
  max_per_message: 3,
  allow_duplicate_in_conversation: false,
  instructions: ''
};

export function MediaTab({
  media, mediaConfig,
  onUpload, onUpdate, onDelete,
  onConfigChange, onSaveConfig, saving,
  canUpload = true,
  canEdit = true,
  canShowConfig = true
}: MediaTabProps) {
  const [section, setSection] = useState<Section>('images');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  
  // Multi-upload state
  const [uploadQueue, setUploadQueue] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  
  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editFilename, setEditFilename] = useState('');
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const images = media.filter(m => m.media_type === 'image');
  const videos = media.filter(m => m.media_type === 'video');
  const documents = media.filter(m => m.media_type === 'document');
  const config = mediaConfig || DEFAULT_CONFIG;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'image' | 'video' | 'document') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Validate file types
    const allowedImage = ['image/jpeg', 'image/png'];
    const allowedVideo = ['video/mp4'];
    const allowed = mediaType === 'image' ? allowedImage : mediaType === 'video' ? allowedVideo : ALLOWED_DOCUMENT_TYPES;
    
    // Filter valid files
    const validFiles: File[] = [];
    const errors: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowed.includes(file.type)) {
        errors.push(`${file.name}: סוג קובץ לא נתמך`);
        continue;
      }
      if (mediaType === 'video' && file.size > 16 * 1024 * 1024) {
        errors.push(`${file.name}: גדול מ-16MB`);
        continue;
      }
      if (mediaType === 'document' && file.size > MAX_DOCUMENT_SIZE) {
        errors.push(`${file.name}: גדול מ-25MB`);
        continue;
      }
      validFiles.push(file);
    }
    
    if (errors.length > 0) {
      setError(errors.join(', '));
    }
    
    if (validFiles.length === 0) return;
    
    setError(null);
    setUploading(true);
    setUploadQueue({ current: 0, total: validFiles.length });
    
    // Upload files one by one
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setUploadQueue({ current: i + 1, total: validFiles.length });
      setUploadProgress(0);
      setOriginalSize(null);
      
      // Get name from filename (remove extension)
      const fileBaseName = file.name.replace(/\.[^/.]+$/, '');
      
      let fileToUpload = file;
      
      // Compress images if larger than 1MB
      if (mediaType === 'image' && file.size > 1024 * 1024) {
        try {
          setUploadStatus(`דוחס תמונה...`);
          setOriginalSize(file.size);
          
          const compressedFile = await imageCompression(file, COMPRESSION_OPTIONS);
          fileToUpload = compressedFile;
        } catch (compressionError) {
          console.error('Compression failed, using original:', compressionError);
        }
      }
      
      const statusLabel = mediaType === 'image' ? 'תמונה' : mediaType === 'document' ? 'קובץ' : fileBaseName;
      setUploadStatus(`מעלה ${statusLabel}...`);
      
      const wasCompressed = fileToUpload !== file;
      
      try {
        await onUpload(fileToUpload, {
          name: mediaType !== 'image' ? fileBaseName : undefined,
          media_type: mediaType,
          display_filename: mediaType === 'document' ? file.name : undefined,
          original_size: wasCompressed ? file.size : undefined
        }, (progress) => {
          setUploadProgress(progress);
          if (mediaType === 'image') {
            if (progress < 50) setUploadStatus('מעלה תמונה...');
            else if (progress < 100) setUploadStatus('מנתח תמונה...');
          } else if (mediaType === 'document') {
            if (progress < 50) setUploadStatus('מעלה קובץ...');
            else if (progress < 100) setUploadStatus('מנתח קובץ...');
          } else {
            if (progress < 70) setUploadStatus(`מעלה ${fileBaseName}...`);
            else if (progress < 100) setUploadStatus('יוצר embedding...');
          }
        });
      } catch (e) {
        setError(prev => {
          const msg = e instanceof Error ? e.message : 'שגיאה';
          const displayName = mediaType === 'image' ? 'תמונה' : fileBaseName;
          return prev ? `${prev}, ${displayName}: ${msg}` : `${displayName}: ${msg}`;
        });
      }
    }
    
    setUploading(false);
    setUploadProgress(0);
    setUploadStatus('');
    setOriginalSize(null);
    setUploadQueue({ current: 0, total: 0 });
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (documentInputRef.current) documentInputRef.current.value = '';
  };

  const startEdit = (item: AgentMedia) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description || '');
    setEditCaption(item.default_caption || '');
    setEditFilename(item.filename || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditCaption('');
    setEditFilename('');
  };

  const saveEdit = async (mediaId: number, isDocument = false) => {
    try {
      await onUpdate(mediaId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        default_caption: editCaption.trim() || undefined,
        filename: isDocument && editFilename.trim() ? editFilename.trim() : undefined
      });
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בעדכון');
    }
  };

  const handleDelete = async (mediaId: number, name: string) => {
    if (!confirm(`למחוק את "${name}"?`)) return;
    try {
      await onDelete(mediaId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה במחיקה');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocumentIcon = (mimeType: string | null) => {
    if (!mimeType) return '📄';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word')) return '📘';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📙';
    if (mimeType.includes('text')) return '📝';
    return '📄';
  };

  const renderMediaItem = (item: AgentMedia) => {
    const isEditing = editingId === item.id;
    const isDocument = item.media_type === 'document';
    
    return (
      <div key={item.id} className="bg-slate-800/30 rounded-lg p-3">
        <div className="flex gap-3">
          {/* Preview - clickable to open */}
          <a 
            href={item.file_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-16 h-16 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
            title="לחץ לפתיחה"
          >
            {item.media_type === 'image' ? (
              <img 
                src={item.file_url} 
                alt={item.name}
                className="w-full h-full object-cover"
              />
            ) : item.media_type === 'document' ? (
              <div className="w-full h-full flex items-center justify-center text-2xl">
                {getDocumentIcon(item.mime_type)}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">
                🎬
              </div>
            )}
          </a>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                  placeholder="שם"
                />
                {isDocument && (
                  <input
                    type="text"
                    value={editFilename}
                    onChange={(e) => setEditFilename(e.target.value)}
                    className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    placeholder="שם קובץ בווצאפ (למשל: מחירון.pdf)"
                  />
                )}
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                  placeholder="תיאור (לחיפוש)"
                />
                <input
                  type="text"
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                  placeholder="כיתוב ברירת מחדל"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => saveEdit(item.id, isDocument)}>שמור</Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>ביטול</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="font-medium text-white truncate">{item.name}</div>
                {isDocument && item.filename && (
                  <div className="text-xs text-amber-400 truncate">📎 {item.filename}</div>
                )}
                {item.description && (
                  <div className="text-xs text-slate-400 truncate">{item.description}</div>
                )}
                {item.default_caption && (
                  <div className="text-xs text-blue-400 truncate">💬 {item.default_caption}</div>
                )}
                <div className="text-xs text-slate-500 mt-1">
                  {formatFileSize(item.file_size)}
                  {item.original_size && item.original_size > item.file_size && (
                    <span className="text-green-400 mr-2">
                      (נדחס מ-{formatFileSize(item.original_size)})
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          
          {/* Actions */}
          {!isEditing && (
            <div className="flex gap-1">
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-green-400 transition-colors p-1"
                title="פתח בטאב חדש"
              >
                🔗
              </a>
              {canEdit && (
                <button
                  onClick={() => startEdit(item)}
                  className="text-slate-500 hover:text-blue-400 transition-colors p-1"
                  title="ערוך"
                >
                  ✏️
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => handleDelete(item.id, item.name)}
                  className="text-slate-500 hover:text-red-400 transition-colors p-1"
                  title="מחק"
                >
                  🗑️
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'images' as Section, label: '🖼️ תמונות', count: images.length, show: true },
          { id: 'videos' as Section, label: '🎬 סרטונים', count: videos.length, show: true },
          { id: 'documents' as Section, label: '📄 קבצים', count: documents.length, show: true },
          { id: 'settings' as Section, label: '⚙️ הגדרות', count: null, show: canShowConfig },
        ].filter(tab => tab.show).map(tab => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${section === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }
            `}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="mr-2 text-xs opacity-70">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <Card className="!bg-blue-500/10 border-blue-500/30">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="text-sm text-blue-300 mb-2">
                {uploadQueue.total > 1 && (
                  <span className="text-white font-medium ml-2">
                    [{uploadQueue.current}/{uploadQueue.total}]
                  </span>
                )}
                {uploadStatus}
                {originalSize && uploadStatus.includes('דוחס') && (
                  <span className="text-slate-400 mr-2">
                    ({formatFileSize(originalSize)})
                  </span>
                )}
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <span className="text-blue-400 font-medium">{uploadProgress}%</span>
          </div>
        </Card>
      )}

      {/* Content */}
      <Card>
        {/* === Images === */}
        {section === 'images' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-medium text-white">תמונות</h3>
              {canUpload && (
                <div className="flex gap-2 items-center">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    multiple
                    onChange={(e) => handleFileSelect(e, 'image')}
                    disabled={uploading}
                    className="hidden"
                  />
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                  >
                    + העלה תמונות
                  </Button>
                </div>
              )}
            </div>

            {canUpload && (
              <div className="text-xs text-slate-400 bg-slate-800/30 rounded-lg p-3">
                🖼️ פורמטים: JPG, PNG (דחיסה אוטומטית אם מעל 1MB)
                <br />
                🤖 שם, תיאור וכיתוב נוצרים אוטומטית בעזרת AI. לחץ על ✏️ לעריכה
              </div>
            )}

            {images.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-4xl mb-2">🖼️</div>
                <div>אין תמונות עדיין</div>
              </div>
            ) : (
              <div className="space-y-2">
                {images.map(renderMediaItem)}
              </div>
            )}
          </div>
        )}

        {/* === Videos === */}
        {section === 'videos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-medium text-white">סרטונים</h3>
              {canUpload && (
                <div className="flex gap-2 items-center">
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4"
                    multiple
                    onChange={(e) => handleFileSelect(e, 'video')}
                    disabled={uploading}
                    className="hidden"
                  />
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => videoInputRef.current?.click()}
                    disabled={uploading}
                  >
                    + העלה סרטונים
                  </Button>
                </div>
              )}
            </div>

            {canUpload && (
              <div className="text-xs text-slate-400 bg-slate-800/30 rounded-lg p-3">
                🎬 פורמט: MP4 (עד 16MB לסרטון)
                <br />
                ניתן לבחור מספר סרטונים בבת אחת. לחץ על ✏️ להוספת תיאור לחיפוש סמנטי
              </div>
            )}

            {videos.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-4xl mb-2">🎬</div>
                <div>אין סרטונים עדיין</div>
              </div>
            ) : (
              <div className="space-y-2">
                {videos.map(renderMediaItem)}
              </div>
            )}
          </div>
        )}

        {/* === Documents === */}
        {section === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-medium text-white">קבצים</h3>
              {canUpload && (
                <div className="flex gap-2 items-center">
                  <input
                    ref={documentInputRef}
                    type="file"
                    accept={DOCUMENT_ACCEPT}
                    multiple
                    onChange={(e) => handleFileSelect(e, 'document')}
                    disabled={uploading}
                    className="hidden"
                  />
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => documentInputRef.current?.click()}
                    disabled={uploading}
                  >
                    + העלה קבצים
                  </Button>
                </div>
              )}
            </div>

            {canUpload && (
              <div className="text-xs text-slate-400 bg-slate-800/30 rounded-lg p-3">
                📄 פורמטים: PDF, Word, Excel, PowerPoint, TXT (עד 25MB)
                <br />
                הסוכן ישלח קבצים לפי התיאור והקשר השיחה. לחץ על ✏️ לעריכת שם הקובץ בווצאפ
              </div>
            )}

            {documents.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-4xl mb-2">📄</div>
                <div>אין קבצים עדיין</div>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map(renderMediaItem)}
              </div>
            )}
          </div>
        )}

        {/* === Settings === */}
        {section === 'settings' && (
          <div className="space-y-4">
            <h3 className="font-medium text-white">הגדרות מדיה</h3>

            <div className="space-y-4">
              {/* Enabled */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => onConfigChange({ ...config, enabled: e.target.checked })}
                  className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-white">אפשר לסוכן לשלוח מדיה</span>
              </label>

              {/* Max per message */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  מקסימום פריטי מדיה ברצף (בתגובה אחת)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={config.max_per_message}
                  onChange={(e) => onConfigChange({ ...config, max_per_message: parseInt(e.target.value) || 1 })}
                  className="w-20 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                />
              </div>

              {/* Allow duplicates */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allow_duplicate_in_conversation}
                  onChange={(e) => onConfigChange({ ...config, allow_duplicate_in_conversation: e.target.checked })}
                  className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-white">אפשר שליחת אותה מדיה פעמיים באותה שיחה</span>
              </label>

              {/* Instructions */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  הנחיות לסוכן (מתי לשלוח מדיה)
                </label>
                <textarea
                  value={config.instructions}
                  onChange={(e) => onConfigChange({ ...config, instructions: e.target.value })}
                  placeholder="לדוגמה: שלח תמונות כשהלקוח מבקש לראות מוצר, או כשאתה רוצה להמחיש משהו"
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm resize-none"
                  rows={3}
                />
              </div>

              <Button
                variant="primary"
                onClick={onSaveConfig}
                disabled={saving}
              >
                {saving ? 'שומר...' : 'שמור הגדרות'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
