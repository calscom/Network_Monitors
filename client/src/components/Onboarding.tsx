import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  LayoutDashboard, 
  Server, 
  Bell, 
  Map, 
  Users, 
  ChevronRight, 
  ChevronLeft, 
  X,
  CheckCircle2
} from "lucide-react";

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight?: string;
}

const steps: OnboardingStep[] = [
  {
    title: "Welcome to SceptView Network Monitor",
    description: "Monitor your network devices in real-time with SNMP polling, bandwidth tracking, and instant alerts.",
    icon: <LayoutDashboard className="w-12 h-12 text-primary" />,
    highlight: "Let's take a quick tour of the main features."
  },
  {
    title: "Add Your Devices",
    description: "Click 'Add Device' to start monitoring. Enter the device IP, SNMP community string, and select the site location.",
    icon: <Server className="w-12 h-12 text-primary" />,
    highlight: "You can also import devices in bulk using CSV or Excel files."
  },
  {
    title: "Configure Notifications",
    description: "Set up email or Telegram alerts for device offline events, recovery notifications, and high utilization warnings.",
    icon: <Bell className="w-12 h-12 text-primary" />,
    highlight: "Navigate to Settings > Notifications to configure alerts."
  },
  {
    title: "Network Map View",
    description: "Visualize all your sites and devices at a glance. Use kiosk mode (/kiosk) for wall-mounted NOC displays.",
    icon: <Map className="w-12 h-12 text-primary" />,
    highlight: "Toggle between List and Map views using the menu."
  },
  {
    title: "User Management",
    description: "Admins can manage user roles: Viewers (read-only), Operators (device management), and Admins (full access).",
    icon: <Users className="w-12 h-12 text-primary" />,
    highlight: "Access user management from Settings > Users."
  }
];

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;
  
  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };
  
  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };
  
  const handleComplete = () => {
    setIsVisible(false);
    setTimeout(() => {
      onComplete();
    }, 300);
  };
  
  const handleSkip = () => {
    handleComplete();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          data-testid="onboarding-overlay"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <Card className="w-full max-w-lg p-6 relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2"
                onClick={handleSkip}
                aria-label="Skip onboarding tour"
                title="Skip tour"
                data-testid="button-skip-onboarding"
              >
                <X className="w-4 h-4" />
              </Button>
              
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    Step {currentStep + 1} of {steps.length}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(progress)}% complete
                  </span>
                </div>
                <Progress value={progress} className="h-2" data-testid="progress-onboarding" />
              </div>
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="text-center py-4"
                >
                  <div className="flex justify-center mb-4">
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 15 }}
                      className="p-4 bg-primary/10 rounded-full"
                    >
                      {steps[currentStep].icon}
                    </motion.div>
                  </div>
                  
                  <h2 className="text-xl font-bold mb-2" data-testid="text-onboarding-title">
                    {steps[currentStep].title}
                  </h2>
                  
                  <p className="text-muted-foreground mb-4" data-testid="text-onboarding-description">
                    {steps[currentStep].description}
                  </p>
                  
                  {steps[currentStep].highlight && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-primary"
                    >
                      {steps[currentStep].highlight}
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
              
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                <Button
                  variant="ghost"
                  onClick={handlePrev}
                  disabled={isFirstStep}
                  data-testid="button-onboarding-prev"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                
                <div className="flex gap-1" role="tablist" aria-label="Onboarding steps">
                  {steps.map((step, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        index === currentStep 
                          ? 'bg-primary' 
                          : index < currentStep 
                            ? 'bg-primary/50' 
                            : 'bg-muted-foreground/30'
                      }`}
                      aria-label={`Go to step ${index + 1}: ${step.title}`}
                      aria-selected={index === currentStep}
                      role="tab"
                      data-testid={`button-onboarding-dot-${index}`}
                    />
                  ))}
                </div>
                
                <Button
                  onClick={handleNext}
                  data-testid="button-onboarding-next"
                >
                  {isLastStep ? (
                    <>
                      Get Started
                      <CheckCircle2 className="w-4 h-4 ml-1" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
