import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Shield, 
  Zap, 
  BarChart3, 
  Users, 
  Lock,
  CheckCircle,
  ArrowRight,
  Star,
  Globe,
  Bot,
  Wallet,
  Target,
  Activity
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function Landing() {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: Bot,
      title: "Multi-Strategy Trading Bots",
      description: "Deploy advanced algorithms including Martingale, DCA, and custom strategies across multiple cryptocurrency exchanges.",
      stats: "15+ Strategies"
    },
    {
      icon: Shield,
      title: "Security-First Architecture", 
      description: "We only accept read-only and trade-only API permissions. No withdrawal privileges required - your funds stay secure.",
      stats: "100% Secure"
    },
    {
      icon: Activity,
      title: "Real-Time Performance",
      description: "Monitor your bots with live market data, instant notifications, and comprehensive analytics dashboards.",
      stats: "< 100ms Latency"
    },
    {
      icon: Globe,
      title: "Multi-Exchange Support",
      description: "Connect to major cryptocurrency exchanges including Binance, KuCoin, and more with unified management.",
      stats: "5+ Exchanges"
    }
  ];

  const strategies = [
    {
      name: "Martingale Strategy",
      description: "Average down losing positions with calculated safety orders",
      riskLevel: "Medium",
      profitability: "High",
      color: "from-blue-500 to-blue-600"
    },
    {
      name: "DCA Strategy", 
      description: "Dollar-cost averaging for long-term accumulation",
      riskLevel: "Low",
      profitability: "Steady",
      color: "from-green-500 to-green-600"
    },
    {
      name: "Grid Trading",
      description: "Profit from market volatility with automated grid orders",
      riskLevel: "Medium",
      profitability: "Consistent",
      color: "from-purple-500 to-purple-600"
    }
  ];

  const testimonials = [
    {
      name: "Alex Chen",
      role: "Crypto Trader",
      content: "The platform's security approach gives me complete peace of mind. My funds never leave my exchange account.",
      avatar: "AC",
      rating: 5
    },
    {
      name: "Sarah Rodriguez",
      role: "Portfolio Manager", 
      content: "Multi-strategy bots have transformed my trading. The real-time analytics help me optimize performance daily.",
      avatar: "SR",
      rating: 5
    },
    {
      name: "Michael Kim",
      role: "DeFi Investor",
      content: "Finally, a bot platform that doesn't require withdrawal permissions. Security and performance in one package.",
      avatar: "MK", 
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-crypto-darker via-crypto-dark to-crypto-darker">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-crypto-dark/95 backdrop-blur-sm border-b border-gray-800 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-crypto-accent to-crypto-primary rounded-lg flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">CryptoBot Pro</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-crypto-light hover:text-white transition-colors">Features</a>
              <a href="#strategies" className="text-crypto-light hover:text-white transition-colors">Strategies</a>
              <a href="#security" className="text-crypto-light hover:text-white transition-colors">Security</a>
              <a href="#testimonials" className="text-crypto-light hover:text-white transition-colors">Reviews</a>
            </div>
            
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <>
                  <Link href="/">
                    <Button variant="ghost" className="text-crypto-light hover:text-white hover:bg-gray-800">
                      Access App
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button className="bg-gradient-to-r from-crypto-accent to-crypto-primary hover:from-crypto-accent/90 hover:to-crypto-primary/90 text-white">
                      Dashboard
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="ghost" className="text-crypto-light hover:text-white hover:bg-gray-800">
                      Login
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button className="bg-gradient-to-r from-crypto-accent to-crypto-primary hover:from-crypto-accent/90 hover:to-crypto-primary/90 text-white">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <Badge className="mb-6 bg-crypto-accent/10 text-crypto-accent border-crypto-accent/20">
              🚀 Advanced Crypto Trading Automation
            </Badge>
            
            <h1 className="text-5xl lg:text-7xl font-bold text-white mb-6 leading-tight">
              Automate Your
              <span className="bg-gradient-to-r from-crypto-accent to-crypto-primary bg-clip-text text-transparent"> Crypto Trading</span>
            </h1>
            
            <p className="text-xl text-crypto-light mb-8 max-w-3xl mx-auto leading-relaxed">
              Deploy intelligent trading bots across major cryptocurrency exchanges with military-grade security. 
              Our platform requires zero withdrawal permissions - your funds remain 100% under your control.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              {isAuthenticated ? (
                <>
                  <Link href="/bots">
                    <Button size="lg" className="bg-gradient-to-r from-crypto-accent to-crypto-primary hover:from-crypto-accent/90 hover:to-crypto-primary/90 text-white px-8 py-4 text-lg">
                      Create Trading Bots
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  
                  <Link href="/dashboard">
                    <Button size="lg" variant="outline" className="border-gray-700 text-crypto-light hover:bg-gray-800 hover:text-white px-8 py-4 text-lg">
                      View Dashboard
                      <BarChart3 className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/register">
                    <Button size="lg" className="bg-gradient-to-r from-crypto-accent to-crypto-primary hover:from-crypto-accent/90 hover:to-crypto-primary/90 text-white px-8 py-4 text-lg">
                      Start Trading Bots
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  
                  <Link href="#demo">
                    <Button size="lg" variant="outline" className="border-gray-700 text-crypto-light hover:bg-gray-800 hover:text-white px-8 py-4 text-lg">
                      Watch Demo
                      <BarChart3 className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </>
              )}
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">$2.5M+</div>
                <div className="text-crypto-light">Trading Volume</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">10,000+</div>
                <div className="text-crypto-light">Active Bots</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">99.9%</div>
                <div className="text-crypto-light">Uptime</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">24/7</div>
                <div className="text-crypto-light">Support</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Powerful Features for Professional Trading
            </h2>
            <p className="text-xl text-crypto-light max-w-3xl mx-auto">
              Everything you need to automate your cryptocurrency trading with confidence and security
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card 
                  key={index}
                  className={`bg-crypto-dark border-gray-800 transition-all duration-300 cursor-pointer ${
                    hoveredFeature === index ? 'border-crypto-accent/50 transform scale-105' : ''
                  }`}
                  onMouseEnter={() => setHoveredFeature(index)}
                  onMouseLeave={() => setHoveredFeature(null)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <Icon className="h-10 w-10 text-crypto-accent" />
                      <Badge variant="secondary" className="bg-crypto-accent/10 text-crypto-accent">
                        {feature.stats}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-3">{feature.title}</h3>
                    <p className="text-crypto-light leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Strategies Section */}
      <section id="strategies" className="py-20 px-6 lg:px-8 bg-crypto-dark/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Proven Trading Strategies
            </h2>
            <p className="text-xl text-crypto-light max-w-3xl mx-auto">
              Choose from battle-tested algorithms designed to perform in any market condition
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {strategies.map((strategy, index) => (
              <Card key={index} className="bg-crypto-dark border-gray-800 overflow-hidden group hover:border-crypto-accent/50 transition-all duration-300">
                <div className={`h-2 bg-gradient-to-r ${strategy.color}`}></div>
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-white mb-3">{strategy.name}</h3>
                  <p className="text-crypto-light mb-6 leading-relaxed">{strategy.description}</p>
                  
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <div className="text-sm text-crypto-light">Risk Level</div>
                      <div className="text-white font-medium">{strategy.riskLevel}</div>
                    </div>
                    <div>
                      <div className="text-sm text-crypto-light">Profitability</div>
                      <div className="text-white font-medium">{strategy.profitability}</div>
                    </div>
                  </div>
                  
                  <Button className="w-full bg-gray-800 hover:bg-gray-700 text-white group-hover:bg-crypto-accent group-hover:text-white transition-all">
                    Learn More
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-20 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-6 bg-green-500/10 text-green-400 border-green-500/20">
                🔒 Bank-Grade Security
              </Badge>
              
              <h2 className="text-4xl font-bold text-white mb-6">
                Your Funds Stay in Your Control
              </h2>
              
              <p className="text-xl text-crypto-light mb-8 leading-relaxed">
                We've engineered our platform with a security-first approach. Unlike other trading platforms, 
                we never request withdrawal permissions for your API keys.
              </p>
              
              <div className="space-y-4 mb-8">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                  <span className="text-white">No withdrawal permissions required</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                  <span className="text-white">Read-only and trade-only API access</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                  <span className="text-white">Encrypted credential storage</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                  <span className="text-white">Full responsibility lies with your exchange</span>
                </div>
              </div>
              
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white">
                Learn About Our Security
              </Button>
            </div>
            
            <div className="relative">
              <div className="bg-gradient-to-br from-crypto-dark to-crypto-darker p-8 rounded-2xl border border-gray-800">
                <div className="flex items-center justify-between mb-6">
                  <Lock className="h-8 w-8 text-green-400" />
                  <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                    Secure
                  </Badge>
                </div>
                
                <h3 className="text-xl font-semibold text-white mb-4">API Permission Model</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <span className="text-green-400">✓ Read Account Information</span>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <span className="text-green-400">✓ Place Trading Orders</span>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                    <span className="text-red-400">✗ Withdraw Funds</span>
                    <div className="w-4 h-4 rounded-full border-2 border-red-400"></div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                    <span className="text-red-400">✗ Transfer Assets</span>
                    <div className="w-4 h-4 rounded-full border-2 border-red-400"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-6 lg:px-8 bg-crypto-dark/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Trusted by Thousands of Traders
            </h2>
            <p className="text-xl text-crypto-light max-w-3xl mx-auto">
              See what our community says about their trading automation experience
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-crypto-dark border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  
                  <p className="text-crypto-light mb-6 leading-relaxed">"{testimonial.content}"</p>
                  
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-crypto-accent rounded-full flex items-center justify-center text-white font-semibold">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <div className="text-white font-medium">{testimonial.name}</div>
                      <div className="text-crypto-light text-sm">{testimonial.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Automate Your Trading?
          </h2>
          
          <p className="text-xl text-crypto-light mb-8">
            Join thousands of traders who trust our secure platform for automated cryptocurrency trading
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isAuthenticated ? (
              <>
                <Link href="/bots">
                  <Button size="lg" className="bg-gradient-to-r from-crypto-accent to-crypto-primary hover:from-crypto-accent/90 hover:to-crypto-primary/90 text-white px-8 py-4 text-lg">
                    Create Your First Bot
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                
                <Link href="/settings">
                  <Button size="lg" variant="outline" className="border-gray-700 text-crypto-light hover:bg-gray-800 hover:text-white px-8 py-4 text-lg">
                    Account Settings
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/register">
                  <Button size="lg" className="bg-gradient-to-r from-crypto-accent to-crypto-primary hover:from-crypto-accent/90 hover:to-crypto-primary/90 text-white px-8 py-4 text-lg">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="border-gray-700 text-crypto-light hover:bg-gray-800 hover:text-white px-8 py-4 text-lg">
                    Contact Sales
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12 px-6 lg:px-8 bg-crypto-dark">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-crypto-accent to-crypto-primary rounded-lg flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">CryptoBot Pro</span>
              </div>
              <p className="text-crypto-light">
                Secure cryptocurrency trading automation for the modern trader.
              </p>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <div className="space-y-2">
                <a href="#features" className="block text-crypto-light hover:text-white transition-colors">Features</a>
                <a href="#strategies" className="block text-crypto-light hover:text-white transition-colors">Strategies</a>
                <a href="#pricing" className="block text-crypto-light hover:text-white transition-colors">Pricing</a>
                <a href="#security" className="block text-crypto-light hover:text-white transition-colors">Security</a>
              </div>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Support</h3>
              <div className="space-y-2">
                <a href="#docs" className="block text-crypto-light hover:text-white transition-colors">Documentation</a>
                <a href="#help" className="block text-crypto-light hover:text-white transition-colors">Help Center</a>
                <a href="#contact" className="block text-crypto-light hover:text-white transition-colors">Contact</a>
                <a href="#status" className="block text-crypto-light hover:text-white transition-colors">Status</a>
              </div>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <div className="space-y-2">
                <a href="#about" className="block text-crypto-light hover:text-white transition-colors">About</a>
                <a href="#blog" className="block text-crypto-light hover:text-white transition-colors">Blog</a>
                <a href="#careers" className="block text-crypto-light hover:text-white transition-colors">Careers</a>
                <a href="#legal" className="block text-crypto-light hover:text-white transition-colors">Legal</a>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-crypto-light">© 2025 CryptoBot Pro. All rights reserved.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="#privacy" className="text-crypto-light hover:text-white transition-colors">Privacy</a>
              <a href="#terms" className="text-crypto-light hover:text-white transition-colors">Terms</a>
              <a href="#cookies" className="text-crypto-light hover:text-white transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}