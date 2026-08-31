export type FileType = 'pdf' | 'image' | 'docx' | 'audio' | 'note' | 'file';

export type FileStatus = 'pending' | 'active' | 'expired';

export type FileVisibility = 'public' | 'private';

export type WorkspaceType = 'private' | 'public';

export type WorkspaceMode = 'private' | 'public' | 'protected';

export interface SupabaseWorkspace {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  mode: WorkspaceMode;
  password_hash: string | null;
  recovery_key_hash: string | null;
  share_token: string | null;
  share_enabled: boolean;
  created_at: string;
}

export interface OwnerSession {
  token_hash: string;
  workspace_id: string;
  expires_at: string;
  created_at: string;
}

export interface SupabaseFile {
  id: number;
  type: FileType;
  slug: string;
  status: FileStatus;
  visibility: FileVisibility;
  content: string | null;
  storage_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  view_count: number;
  workspace_id: string | null;
  file_token: string;
  password_hash: string | null;
  created_at: string;
  expires_at: string;
}

export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
};
