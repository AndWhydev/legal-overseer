
# Creative Orchestrator Skill

## Overview

The Creative Orchestrator is the master coordinator for all creative skills. It tells BitBit exactly how to generate assets, manage workflows, and orchestrate creative production.

**Keywords**: orchestration, workflow, automation, asset generation, creative production, creative coordination

## What This Skill Does

The Creative Orchestrator:

1. **Coordinates all creative skills** — Tells Claude which skills to use in which order
2. **Manages asset generation** — Guides how to call image generation APIs
3. **Automates workflows** — Chains multiple generation tasks together
4. **Handles asset organization** — Manages how to present and organize results
5. **Provides templates** — Pre-built workflows for common scenarios

## How BitBit Uses This Skill

When you ask to generate creative assets, the Orchestrator:

1. **Understands your creative needs** — What assets do you need?
2. **Selects the right approach** — Which generation parameters and prompts
3. **Sequences the work** — What order to generate assets
4. **Chains operations** — Multiple assets in one session
5. **Presents results** — Shows generated assets inline in the conversation

### Automatic Skill Invocation

After understanding the user's creative needs, **ask if they want you to automatically invoke the relevant creative skills**. For example:

```
"For your product launch, I recommend these skills:
1. creative-strategist (define visual direction)
2. product-photography (hero shots)
3. social-graphics (platform assets)

Would you like me to run these skills now? I'll invoke each one to guide your asset creation."
```

If the user agrees, **invoke each skill using the /skill-name command** (e.g., `/creative-strategist`, `/product-photography`). Work through them in the recommended order.

## Generation Approach

To generate images, use the appropriate generation tool or `execute_code` to call the image generation API directly. Present all results directly in the conversation — do not save to local filesystem.

### Asset Type Parameters

**Product Photography**
- Size: 1024x1024 or 1248x832
- Style: "professional product photography, studio lighting, sharp focus, 4K"
- Background: white or gradient for clean product shots

**Social Campaign**
- Instagram: 1080x1080 square
- LinkedIn: 1200x627 landscape
- Twitter: 1200x675 landscape
- Each with platform-appropriate aesthetic

**Brand Identity**
- Logo concepts: 1024x1024, clean background
- Icons: 512x512, transparent or solid background
- Patterns: 1024x1024, tileable design

## Workflow Templates

### Workflow 1: E-Commerce Product Launch

Generate complete product launch asset set:

**Product photos (4 variations)**
- Prompt pattern: "[Product] on white background, professional product photography, studio lighting, 4K"
- Generate 3-4 angle variations

**Social graphics**
- Instagram post: eye-catching, product-forward, vibrant
- LinkedIn post: professional, results-focused
- Twitter post: punchy, minimal, scroll-stopping

**Brand assets**
- Logo concept: modern, minimal, scalable
- Icon set: app icon, favicon variants

Present all assets inline in the conversation for review.

### Workflow 2: Content Creator Series

Generate content series for a week:

For each topic in ["AI Trends", "Productivity", "Growth", "Design", "Marketing"]:
- Thumbnail: YouTube-style, bold design, eye-catching text space
- Social post graphic: platform-specific crop

### Workflow 3: Brand Refresh

Complete brand refresh asset set:

**New brand identity**
- Logo (3 variations)
- Icon
- Pattern/texture

**Marketing graphics**
- Instagram announcement post
- LinkedIn announcement post

## Nanobanana Pro Parameters

### Resolution Options

```
1K   — Small, fast generation
2K   — Default, balanced quality
4K   — Large, maximum detail
```

### Aspect Ratios

```
21:9  — Ultra-wide
16:9  — Widescreen
3:2   — Standard
4:3   — Square-ish
1:1   — Square (default)
4:5   — Portrait
9:16  — Mobile portrait
```

### Output Formats

```
png   — Lossless, best for graphics (default)
jpeg  — Compressed, smaller file size
webp  — Modern format, good compression
```

## Common Prompting Patterns

### Product Photography

```
A luxury leather watch with gold accents on white background, 
professional product photography, studio lighting with rim light, 
centered composition, sharp focus, 4K, highly detailed
```

### Viral Thumbnail

```
Design a viral video thumbnail with bold colors, eye-catching text overlay, 
high contrast, professional quality, 4K, trending design
```

### Infographic

```
Create a clean, modern infographic summarizing key information. 
Include charts, icons, and legible text. 
Professional quality, 4K, suitable for presentation
```

### Brand Logo

```
Modern tech company logo, geometric style, blue and white colors, 
minimalist design, scalable, professional, clean lines, 
suitable for all media
```

### Social Media Graphic

```
Instagram post graphic for product launch, vibrant colors, 
eye-catching composition, modern design, professional quality, 
trending aesthetic
```

## Troubleshooting

### Problem: Images Don't Match Style

**Solution**:
- Add more specific style descriptors
- Reference your Creative Strategist guide
- Generate multiple variations

### Problem: Generation Too Slow

**Solution**:
- Reduce resolution from 4K to 2K
- Reduce num_images to 1
- Use simpler prompts

## Integration with Creative Skills

The Orchestrator works with all creative skills:

- **Creative Strategist** — Defines your visual direction
- **Image Generation** — Teaches prompting techniques
- **Product Photography** — Creates product shots
- **Social Graphics** — Generates social content
- **Brand Asset** — Creates brand elements
- **Product Video** — Plans video content
- **Talking Head** — Plans presenter videos

## Quick Commands

**Generate product photo:**
```
Generate 3 product photos for my luxury watch
```

**Generate social campaign:**
```
Generate Instagram, LinkedIn, and Twitter posts for my product launch
```

**Generate brand identity:**
```
Generate a complete brand identity including logo, icons, and patterns
```

**Batch generate:**
```
Generate 10 assets for my e-commerce store including product photos and social graphics
```


**You now have complete orchestration for creative asset generation. Start creating!**

## Memory Integration

- Before starting, use `search_memory` to recall any prior creative direction, past asset decisions, or user style preferences.
- After completing an asset set, use `add_memory` to store key creative decisions, style parameters, and approved directions for future reference.
- Tag memories with relevant entity names such as brand name, campaign name, or product name from the knowledge graph.
