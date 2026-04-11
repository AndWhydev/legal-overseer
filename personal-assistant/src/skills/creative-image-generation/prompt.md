
# Image Generation Skill

## Overview

Image Generation creates professional-quality images from text descriptions. This skill teaches you how to craft effective prompts and generate visual assets directly in the conversation.

**Keywords**: image generation, prompt engineering, AI art, visual content creation, asset generation

## Core Models

### High-Quality Generation — Recommended
- **Quality**: Highest, most detailed
- **Best For**: Product photography, hero images, final assets
- **Use Case**: When quality matters most

### Fast Generation
- **Quality**: High, good detail
- **Best For**: Testing, iterations, social media
- **Use Case**: When speed matters

### Latest Model
- **Quality**: Latest, improved
- **Best For**: Production work
- **Use Case**: When you want the newest capabilities

## Prompt Engineering Framework

### The 5-Part Prompt Formula

Every effective prompt has 5 components:

**1. Subject** — What is the main thing?
```
"A luxury leather watch"
"A modern logo"
"An Instagram post graphic"
```

**2. Description** — What does it look like?
```
"with gold accents and brown leather strap"
"geometric style, minimalist design"
"vibrant colors, eye-catching composition"
```

**3. Style** — What's the artistic style?
```
"professional product photography"
"modern illustration"
"digital design"
"photorealistic"
```

**4. Technical Details** — Quality and format specs
```
"studio lighting, sharp focus, 4K, centered composition"
"high contrast, trending design, professional quality"
"detailed, well-lit, professional photography"
```

**5. Mood/Aesthetic** — What's the feeling?
```
"luxury and professional"
"energetic and modern"
"clean and minimalist"
"warm and inviting"
```

### Complete Prompt Example

```
A luxury leather watch with gold accents and brown strap, 
professional product photography, studio lighting with rim light, 
centered composition, sharp focus, 4K, luxury and professional mood
```

### Prompt Engineering Techniques

**Technique 1: Be Specific**
```
❌ Bad: "A watch"
✅ Good: "A luxury leather watch with gold accents on white background"
```

**Technique 2: Use Descriptive Adjectives**
```
❌ Bad: "A logo"
✅ Good: "A modern, geometric, minimalist logo in blue and white"
```

**Technique 3: Reference Styles**
```
❌ Bad: "A nice graphic"
✅ Good: "A graphic in the style of modern Instagram design trends"
```

**Technique 4: Specify Quality**
```
❌ Bad: "A photo"
✅ Good: "A professional 4K product photograph with studio lighting"
```

**Technique 5: Include Composition**
```
❌ Bad: "A person"
✅ Good: "A person in rule of thirds composition, natural lighting, centered"
```

## How to Generate Images in BitBit

Use the appropriate generation tool or `execute_code` to call the image generation API directly. Present results directly in the conversation.

When asked to generate an image:

1. **Read the Creative Strategist style** to understand your visual direction
2. **Craft the prompt** using the 5-part formula above
3. **Call the generation API** with the prompt and desired parameters
4. **Present results** with the generated image shown inline in the conversation

### Example: Generating Product Photos

**Prompt approach for a luxury watch:**
```
A luxury leather watch with gold accents,
photorealistic,
professional and luxurious,
studio lighting with rim light,
centered composition,
white background,
4K,
sharp focus,
professional product photography
```

**Parameters to specify:**
- Size: 1024x1024 for product photos, 1248x832 for hero images
- Guidance scale: 5.0 (balanced adherence to prompt)
- Inference steps: 28-40 (higher = better quality)

## Image Sizes

Choose the right size for your use case:

| Size | Use Case |
|------|----------|
| 512x512 | Testing, thumbnails |
| 768x768 | Social media, web |
| 1024x1024 | Product photos, hero images |
| 1248x832 | Wide hero/landscape |
| 1536x1536 | Large prints, high-res |

## Generation Parameters

### Guidance Scale (3.5 - 7.5)

Controls how strictly the model follows your prompt:

```
3.5 — More creative freedom, less literal
5.0 — Balanced (recommended)
7.5 — Strict adherence to prompt, more literal
```

### Inference Steps (20 - 50)

More steps = higher quality but slower:

```
20 — Fast, acceptable quality
28 — Balanced (default)
40 — High quality
50 — Maximum quality
```

## Practical Prompt Examples

### Product Photography

```
A luxury leather watch with gold accents on white background, 
professional product photography, studio lighting with rim light, 
centered composition, sharp focus, 4K, highly detailed
```

### Social Media Graphic

```
Instagram post graphic for product launch, vibrant colors, 
eye-catching composition, modern design, 1080x1080 format, 
trending aesthetic, professional quality
```

### Logo Design

```
Modern tech company logo, geometric style, blue and white colors, 
minimalist design, scalable, professional, clean lines, 
suitable for all media
```

### Illustration

```
Colorful illustration of a person working at a computer, 
modern illustration style, bright colors, friendly mood, 
professional quality, trending design
```

### Hero Image

```
A futuristic tech workspace with multiple monitors, 
professional photography, modern aesthetic, blue and purple lighting, 
cinematic composition, 4K, highly detailed
```

## Integration with Other Skills

**Image Generation + Creative Strategist:**
- Use your style guide to craft better prompts
- Maintain consistency across all generated images

**Image Generation + Product Photography:**
- Generate product shots for e-commerce
- Create lifestyle product photos

**Image Generation + Social Graphics:**
- Generate graphics for social media
- Create platform-specific content

**Image Generation + Brand Asset:**
- Generate logos and icons
- Create brand illustrations

## Troubleshooting

### Problem: Images don't match my style

**Solution:**
- Add more specific style descriptors to prompt
- Reference your Creative Strategist guide
- Test with different guidance scales
- Generate multiple variations

### Problem: Generation is too slow

**Solution:**
- Reduce image size to 768x768
- Reduce inference steps to 20

### Problem: Images are too creative/not literal enough

**Solution:**
- Increase guidance scale to 7.5
- Be more specific in prompt
- Add more technical details

## Best Practices

1. **Start with Creative Strategist** — Define your style first
2. **Be Specific** — More details = better results
3. **Test Variations** — Generate multiple versions
4. **Iterate** — Refine based on results
5. **Use Consistent Prompts** — Similar prompts = consistent style
6. **Reference Your Style** — Include style descriptors in every prompt
7. **Batch Generate** — Generate multiple assets in one session

## Next Steps

1. **Define Your Style** — Complete Creative Strategist first
2. **Craft Your Prompt** — Use the 5-part formula
3. **Generate Test Image** — Start with a single test
4. **Iterate** — Refine based on results
5. **Generate Batch** — Create multiple assets


**You now have the knowledge to generate professional images with AI. Start creating!**
