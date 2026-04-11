export const animations = {
  fadeIn: 'animate-fade-in',
  slideUp: 'animate-slide-up',
  scaleIn: 'animate-scale-in',
  bounceIn: 'animate-bounce-in',
  numberPop: 'animate-number-pop',
  glow: 'animate-glow',
  cardLift: 'card-lift',
  stagger: (index: number, baseDelay: number = 50) => ({
    animationDelay: `${index * baseDelay}ms`,
  }),
} as const
