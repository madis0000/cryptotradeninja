import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface RegisterFormProps {
  onSuccess: (token: string, user: any) => void;
  onSwitchToLogin: () => void;
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await apiRequest('/api/auth/register', 'POST', formData);
      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        onSuccess(data.token, data.user);
        toast({
          title: "Registration successful",
          description: `Welcome, ${data.user.username}!`,
        });
      } else {
        throw new Error(data.error || 'Registration failed');
      }
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md bg-crypto-dark border-gray-800">
      <CardHeader className="text-center">
        <div className="w-12 h-12 bg-gradient-to-br from-crypto-accent to-crypto-success rounded-lg flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-robot text-white text-xl"></i>
        </div>
        <CardTitle className="text-2xl font-bold text-white">Create Account</CardTitle>
        <p className="text-crypto-light">Start your crypto trading journey</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username" className="text-crypto-light">Username</Label>
            <Input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Choose a username"
              className="bg-crypto-darker border-gray-800 text-white"
              required
            />
          </div>

          <div>
            <Label htmlFor="email" className="text-crypto-light">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter your email"
              className="bg-crypto-darker border-gray-800 text-white"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="password" className="text-crypto-light">Password</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Create a password"
              className="bg-crypto-darker border-gray-800 text-white"
              required
              minLength={8}
            />
          </div>

          <div>
            <Label htmlFor="confirmPassword" className="text-crypto-light">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Confirm your password"
              className="bg-crypto-darker border-gray-800 text-white"
              required
            />
          </div>

          <Button 
            type="submit" 
            className="w-full bg-crypto-accent hover:bg-crypto-accent/80 text-white"
            disabled={isLoading}
          >
            {isLoading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-crypto-light text-sm">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-crypto-accent hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}