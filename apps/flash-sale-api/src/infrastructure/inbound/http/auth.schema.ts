import { z } from 'zod';

export const registerUserSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email({ message: 'Invalid email format' })
    .transform((email) => email.toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(72, { message: 'Password must be at most 72 characters' }),
});

export type RegisterUserDTO = z.infer<typeof registerUserSchema>;
