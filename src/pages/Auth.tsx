import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import logoIcon from "@/assets/logo-icon.jpeg";

type AppRole = "sales" | "supply_chain" | "admin" | "finance";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState<AppRole>("sales");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string }>({});

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const validateForm = () => {
    const newErrors: { email?: string; password?: string; name?: string } = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (!isLogin) {
      const nameResult = nameSchema.safeParse(name);
      if (!nameResult.success) {
        newErrors.name = nameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
          toast({
            title: "Welcome back!",
            description: "You have successfully logged in.",
          });
          navigate("/");
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

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-md glass animate-fade-in my-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logoIcon} alt="Xboom Logo" className="w-16 h-16 rounded-xl" />
          </div>
          <CardTitle className="text-2xl text-gradient">
            {isLogin ? "Welcome to Xboom OS" : "Join Xboom OS"}
          </CardTitle>
          <CardDescription>
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
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
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
                  className="grid grid-cols-1 gap-3"
                >
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-colors">
                    <RadioGroupItem value="sales" id="sales" />
                    <Label htmlFor="sales" className="cursor-pointer flex-1">
                      <span className="font-medium">Sales Team</span>
                      <p className="text-sm text-muted-foreground">
                        Manage customer enquiries and orders
                      </p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-colors">
                    <RadioGroupItem value="supply_chain" id="supply_chain" />
                    <Label htmlFor="supply_chain" className="cursor-pointer flex-1">
                      <span className="font-medium">Supply Chain Team</span>
                      <p className="text-sm text-muted-foreground">
                        Handle procurement and inventory
                      </p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-colors">
                    <RadioGroupItem value="finance" id="finance" />
                    <Label htmlFor="finance" className="cursor-pointer flex-1">
                      <span className="font-medium">Finance Team</span>
                      <p className="text-sm text-muted-foreground">
                        Payment tracking and approval workflows
                      </p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-colors">
                    <RadioGroupItem value="admin" id="admin" />
                    <Label htmlFor="admin" className="cursor-pointer flex-1">
                      <span className="font-medium">Admin</span>
                      <p className="text-sm text-muted-foreground">
                        Full system access and user management
                      </p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setErrors({});
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
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
