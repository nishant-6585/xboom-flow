import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, CheckCircle, ShieldCheck } from "lucide-react";
import { z } from "zod";
import logoIcon from "@/assets/logo-icon.jpeg";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "sales" | "supply_chain" | "admin" | "finance" | "it" | "marketing" | "hr";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [needsMfaForReset, setNeedsMfaForReset] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState<AppRole>("sales");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string; confirmPassword?: string; mfa?: string }>({});

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check for password reset flow on mount
  useEffect(() => {
    // Immediately check URL hash for recovery token (Supabase redirects with hash)
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const type = hashParams.get("type");
      const accessToken = hashParams.get("access_token");
      
      if (type === "recovery" && accessToken) {
        setIsResetPassword(true);
        return; // Don't proceed further, we're in recovery mode
      }
    }

    // Listen for auth state changes to detect recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsResetPassword(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string; name?: string; confirmPassword?: string } = {};

    if (!isResetPassword) {
      const emailResult = emailSchema.safeParse(email);
      if (!emailResult.success) {
        newErrors.email = emailResult.error.errors[0].message;
      }
    }

    if (!isForgotPassword) {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) {
        newErrors.password = passwordResult.error.errors[0].message;
      }
    }

    if (isResetPassword) {
      if (password !== confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }

    if (!isLogin && !isForgotPassword && !isResetPassword) {
      const nameResult = nameSchema.safeParse(name);
      if (!nameResult.success) {
        newErrors.name = nameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      // Check if MFA is enrolled and we need AAL2
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (aalData && aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
        // User has MFA enrolled but is at AAL1 — need TOTP verification first
        setNeedsMfaForReset(true);
        setLoading(false);
        return;
      }

      // Either no MFA or already at AAL2 — proceed with password update
      await performPasswordUpdate();
    } catch {
      setLoading(false);
    }
  };

  const handleMfaVerifyForReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode || mfaCode.length !== 6) {
      setErrors({ mfa: "Please enter a valid 6-digit code" });
      return;
    }

    setLoading(true);
    try {
      // Get TOTP factors
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.[0];

      if (!totpFactor) {
        toast({ title: "Error", description: "No MFA factor found.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Create challenge and verify
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
      if (challengeError) {
        toast({ title: "Error", description: challengeError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: mfaCode,
      });

      if (verifyError) {
        setErrors({ mfa: "Invalid verification code. Please try again." });
        setLoading(false);
        return;
      }

      // Now at AAL2 — update password
      await performPasswordUpdate();
    } catch {
      setLoading(false);
    }
  };

  const performPasswordUpdate = async () => {
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setResetSuccess(true);
        setNeedsMfaForReset(false);
        toast({
          title: "Password updated!",
          description: "Your password has been successfully reset.",
        });
        setTimeout(async () => {
          await supabase.auth.signOut();
          setIsResetPassword(false);
          setResetSuccess(false);
          setPassword("");
          setConfirmPassword("");
          setMfaCode("");
          window.history.replaceState(null, "", window.location.pathname);
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      setErrors({ email: emailResult.error.errors[0].message });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Reset email sent!",
          description: "Check your email for the password reset link.",
        });
        setIsForgotPassword(false);
        setEmail("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: "Login failed",
            description: error.message,
            variant: "destructive",
          });
        } else {
          // Check if MFA verification is pending before navigating
          const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          const hasMfaPending =
            !!aalError || (aalData?.currentLevel !== "aal2" && aalData?.nextLevel === "aal2");
          
          if (hasMfaPending) {
            // Never navigate through dashboard while second factor is still pending
            navigate("/mfa-verify", { replace: true });
          } else {
            toast({
              title: "Welcome back!",
              description: "You have successfully logged in.",
            });
            navigate("/");
          }
        }
      } else {
        const { error } = await signUp(email, password, name, team);
        if (error) {
          let errorMessage = error.message;
          if (error.message.includes("already registered")) {
            errorMessage = "This email is already registered. Please login instead.";
          }
          toast({
            title: "Registration failed",
            description: errorMessage,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Account created!",
            description: "You have successfully registered.",
          });
          navigate("/");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Reset Password View (after clicking email link)
  if (isResetPassword) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4 overflow-y-auto">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <Card className="w-full max-w-md glass-strong animate-fade-in my-auto shadow-lg relative">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-5">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl scale-125" />
                <img src={logoIcon} alt="Xboom Logo" className="w-16 h-16 rounded-2xl relative shadow-md" />
              </div>
            </div>
            {resetSuccess ? (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle className="w-16 h-16 text-success" />
                </div>
                <CardTitle className="text-2xl font-display text-gradient">Password Updated!</CardTitle>
                <CardDescription>
                  Redirecting you to sign in...
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-2xl font-display text-gradient">Set New Password</CardTitle>
                <CardDescription className="text-muted-foreground/80">
                  Enter your new password below
                </CardDescription>
              </>
            )}
          </CardHeader>
          {!resetSuccess && (
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="h-11"
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    className="h-11"
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                  )}
                </div>

                <Button type="submit" className="w-full h-11 font-semibold shadow-md hover:shadow-lg transition-shadow" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Update Password
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  // Forgot Password View
  if (isForgotPassword) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4 overflow-y-auto">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <Card className="w-full max-w-md glass-strong animate-fade-in my-auto shadow-lg relative">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-5">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl scale-125" />
                <img src={logoIcon} alt="Xboom Logo" className="w-16 h-16 rounded-2xl relative shadow-md" />
              </div>
            </div>
            <CardTitle className="text-2xl font-display text-gradient">Reset Password</CardTitle>
            <CardDescription className="text-muted-foreground/80">
              Enter your email and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="h-11"
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <Button type="submit" className="w-full h-11 font-semibold shadow-md hover:shadow-lg transition-shadow" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Send Reset Link
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => { setIsForgotPassword(false); setErrors({}); }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
      <Card className="w-full max-w-md glass-strong animate-fade-in my-auto shadow-lg relative">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl scale-125" />
              <img src={logoIcon} alt="Xboom Logo" className="w-16 h-16 rounded-2xl relative shadow-md" />
            </div>
          </div>
          <CardTitle className="text-2xl font-display text-gradient">
            {isLogin ? "Welcome to Xboom OS" : "Join Xboom OS"}
          </CardTitle>
          <CardDescription className="text-muted-foreground/80">
            {isLogin
              ? "Sign in to manage daily operations"
              : "Register to start streamlining operations"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className="h-11"
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-11"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(true); setErrors({}); }}
                    className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-11"
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            {!isLogin && (
              <div className="space-y-3">
                <Label>Team</Label>
                <RadioGroup
                  value={team}
                  onValueChange={(value) => setTeam(value as AppRole)}
                  className="grid grid-cols-1 gap-2"
                >
                  {[
                    { value: "sales", label: "Sales Team", desc: "Manage customer enquiries and orders" },
                    { value: "supply_chain", label: "Supply Chain Team", desc: "Handle procurement and inventory" },
                    { value: "finance", label: "Finance Team", desc: "Payment tracking and approval workflows" },
                    { value: "admin", label: "Admin", desc: "Full system access and user management" },
                    { value: "it", label: "IT Team", desc: "System administration and technical support" },
                    { value: "marketing", label: "Marketing Team", desc: "Campaigns and content management" },
                    { value: "hr", label: "HR Team", desc: "Human resources and employee management" },
                  ].map(({ value, label, desc }) => (
                    <div key={value} className="flex items-center space-x-3 p-3 rounded-lg bg-secondary/40 border border-border/60 hover:border-primary/40 transition-all duration-150 hover:bg-secondary/60">
                      <RadioGroupItem value={value} id={value} />
                      <Label htmlFor={value} className="cursor-pointer flex-1">
                        <span className="font-medium text-sm">{label}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}

            <Button type="submit" className="w-full h-11 font-semibold shadow-md hover:shadow-lg transition-shadow" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setErrors({}); }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium"
            >
              {isLogin
                ? "Don't have an account? Register"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
