export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  user: Partial<User>;
  token: string;
}

export interface ApiError {
  error: string;
  details?: any;
}
