import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Star, StarHalf } from 'lucide-react';

interface SupplierPreferenceTagProps {
  preference: 'low' | 'medium' | 'high';
  size?: 'sm' | 'md';
}

export const SupplierPreferenceTag: React.FC<SupplierPreferenceTagProps> = ({ 
  preference, 
  size = 'sm' 
}) => {
  const getPreferenceConfig = () => {
    switch (preference) {
      case 'high':
        return {
          label: 'Preferred',
          variant: 'default' as const,
          className: 'bg-green-500 hover:bg-green-600 text-white',
          icon: Star
        };
      case 'medium':
        return {
          label: 'Semi-Preferred',
          variant: 'secondary' as const,
          className: 'bg-blue-500 hover:bg-blue-600 text-white',
          icon: StarHalf
        };
      case 'low':
      default:
        return {
          label: 'Regular',
          variant: 'outline' as const,
          className: 'border-muted-foreground/50',
          icon: null
        };
    }
  };

  const config = getPreferenceConfig();
  const Icon = config.icon;
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <Badge 
      variant={config.variant} 
      className={`${config.className} ${sizeClass} gap-1 font-medium`}
    >
      {Icon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
      {config.label}
    </Badge>
  );
};
