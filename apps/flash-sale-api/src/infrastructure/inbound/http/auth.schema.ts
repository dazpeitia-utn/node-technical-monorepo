import { z } from 'zod';

export const registerUserSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email({ message: 'Invalid email format' })
    .transform((email) => email.toLowerCase())
    .describe('User email (stored lowercased)'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(72, { message: 'Password must be at most 72 characters' })
    .describe('Plain password, 8-72 characters. Stored hashed with scrypt.'),
});

export type RegisterUserDTO = z.infer<typeof registerUserSchema>;

// Login de desarrollo: ambos campos opcionales (no verifica credenciales todavía).
export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email format' }).optional()
    .describe('Email to embed in the token (defaults to user@example.com)'),
  userId: z.string().uuid({ message: 'Invalid user ID format' }).optional()
    .describe('User ID to embed in the token (defaults to a fixed test UUID)'),
});

export type LoginDTO = z.infer<typeof loginSchema>;
