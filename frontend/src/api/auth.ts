import { apiClient } from './client'

export type ReadingMode = 'scroll' | 'slide' | 'flip'

export interface UserInfo {
  id: number
  username: string
  email: string
  enable_gallery: boolean
  hide_unread_illustrations: boolean
  reading_mode: ReadingMode
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserInfo
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
}

export interface LoginPayload {
  username: string
  password: string
  remember_me?: boolean
}

export interface UserPreferencesPayload {
  enable_gallery?: boolean
  hide_unread_illustrations?: boolean
  reading_mode?: ReadingMode
}

export async function registerUser(payload: RegisterPayload): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/auth/register', payload)
  return data
}

export async function loginUser(payload: LoginPayload): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/auth/login', payload)
  return data
}

export async function fetchCurrentUser(): Promise<UserInfo> {
  const { data } = await apiClient.get<UserInfo>('/auth/me')
  return data
}

export async function updateUserPreferences(
  payload: UserPreferencesPayload,
): Promise<UserInfo> {
  const { data } = await apiClient.patch<UserInfo>('/auth/preferences', payload)
  return data
}
