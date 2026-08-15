import { describe, expect, it } from "vitest";
import {
  fieldErrorsFrom,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./validation";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const result = registerSchema.safeParse({
      email: "Tester@Example.com",
      password: "Passw0rd",
      confirmPassword: "Passw0rd",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("tester@example.com");
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      email: "tester@example.com",
      password: "Passw0rd",
      confirmPassword: "Different1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrorsFrom(result.error);
      expect(errors.confirmPassword).toBe("Passwords do not match.");
    }
  });

  it("rejects a password without an uppercase letter", () => {
    const result = registerSchema.safeParse({
      email: "tester@example.com",
      password: "password1",
      confirmPassword: "password1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password without a digit", () => {
    const result = registerSchema.safeParse({
      email: "tester@example.com",
      password: "Password",
      confirmPassword: "Password",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "tester@example.com",
      password: "Pw0",
      confirmPassword: "Pw0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "Passw0rd",
      confirmPassword: "Passw0rd",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a non-empty password but does not enforce complexity", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("normalizes email casing and whitespace", () => {
    const result = forgotPasswordSchema.safeParse({ email: "  User@Example.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@example.com");
  });
});

describe("resetPasswordSchema", () => {
  it("requires a token and matching strong passwords", () => {
    expect(
      resetPasswordSchema.safeParse({ token: "", password: "Passw0rd", confirmPassword: "Passw0rd" }).success
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "abc", password: "Passw0rd", confirmPassword: "Passw0rd" }).success
    ).toBe(true);
  });
});

describe("fieldErrorsFrom", () => {
  it("keeps only the first issue per field", () => {
    const result = registerSchema.safeParse({ email: "bad", password: "short", confirmPassword: "other" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrorsFrom(result.error);
      expect(Object.keys(errors)).toEqual(expect.arrayContaining(["email", "password"]));
    }
  });
});
