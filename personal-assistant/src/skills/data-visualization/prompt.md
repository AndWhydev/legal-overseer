# Data Visualization

Create clear, effective data visualizations.

## Quick Start

To generate a chart, use the appropriate generation tool or `execute_code` to call the API directly. Present results directly in the conversation.

**Example: Monthly revenue bar chart**
```python
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use("Agg")

months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
revenue = [42, 48, 55, 61, 72, 89]

fig, ax = plt.subplots(figsize=(10, 6))
ax.bar(months, revenue, color="#3b82f6", width=0.6)
ax.set_ylabel("Revenue ($K)")
ax.set_title("Monthly Revenue Growth", fontweight="bold")
for i, v in enumerate(revenue):
    ax.text(i, v + 1, f"${v}K", ha="center", fontweight="bold")
plt.tight_layout()
# Present inline or save as needed
```


## Chart Selection Guide

### Which Chart for Which Data?

| Data Relationship | Best Chart | Never Use |
|------------------|-----------|-----------|
| **Change over time** | Line chart | Pie chart |
| **Comparing categories** | Bar chart (horizontal for many categories) | Line chart |
| **Part of a whole** | Stacked bar, treemap | Pie chart (controversial but: bar is always clearer) |
| **Distribution** | Histogram, box plot | Bar chart |
| **Correlation** | Scatter plot | Bar chart |
| **Ranking** | Horizontal bar chart | Vertical bar, pie |
| **Geographic** | Choropleth map | Bar chart |
| **Composition over time** | Stacked area chart | Multiple pie charts |
| **Single metric** | Big number (KPI card) | Any chart (overkill) |
| **Flow / process** | Sankey diagram | Bar chart |

### The Pie Chart Problem

Pie charts are almost always the wrong choice:

```
❌ Pie chart problems:
   - Hard to compare similar-sized slices
   - Can't show more than 5-6 categories
   - 3D pie charts are always wrong
   - Impossible to read exact values

✅ Use instead:
   - Horizontal bar chart (easy comparison)
   - Stacked bar (part of whole)
   - Treemap (hierarchical parts)
   - Just a table (if precision matters)
```

## Design Rules

### Axes

| Rule | Why |
|------|-----|
| Always start Y-axis at 0 (bar charts) | Prevents misleading visual |
| Line charts CAN start above 0 | When showing change, not absolute values |
| Label both axes | Reader shouldn't have to guess units |
| Remove unnecessary gridlines | Reduce visual noise |
| Use horizontal labels | Vertical text is hard to read |
| Sort bar charts by value | Don't use alphabetical order unless there's a reason |

### Color

| Principle | Application |
|-----------|------------|
| **Max 5-7 colors** per chart | More becomes unreadable |
| **Highlight one thing** | Grey everything else, color the focus |
| **Sequential** for magnitude | Light → dark for low → high |
| **Diverging** for positive/negative | Red ← neutral → blue |
| **Categorical** for groups | Distinct hues, similar brightness |
| **Colorblind-safe** | Avoid red/green only — add shapes or labels |
| **Consistent meaning** | If blue = revenue, keep it blue everywhere |

### Good Color Palettes

```python
# Sequential (low to high)
sequential = ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1d4ed8"]

# Diverging (negative to positive)
diverging = ["#ef4444", "#f87171", "#d1d5db", "#34d399", "#10b981"]

# Categorical (distinct groups)
categorical = ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"]

# Colorblind-safe
cb_safe = ["#0077BB", "#33BBEE", "#009988", "#EE7733", "#CC3311"]
```

### Text and Labels

| Element | Rule |
|---------|------|
| **Title** | States the insight, not the data type. "Revenue doubled in Q2" not "Q2 Revenue Chart" |
| **Annotations** | Call out key data points directly on the chart |
| **Legend** | Avoid if possible — label directly on chart lines/bars |
| **Font size** | Minimum 12px, 14px+ for presentations |
| **Number format** | Use K, M, B for large numbers (42K not 42,000) |
| **Data labels** | Add to bars/points when exact values matter |

## Chart Recipes

### Line Chart (Time Series)

```python
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use("Agg")

fig, ax = plt.subplots(figsize=(12, 6))
fig.patch.set_facecolor("white")

months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
this_year = [120, 135, 148, 162, 178, 195, 210, 228, 245, 268, 290, 320]
last_year = [95, 102, 108, 115, 122, 130, 138, 145, 155, 165, 178, 190]

ax.plot(months, this_year, color="#3b82f6", linewidth=2.5, marker="o", markersize=6, label="2024")
ax.plot(months, last_year, color="#94a3b8", linewidth=2, linestyle="--", label="2023")
ax.fill_between(range(len(months)), last_year, this_year, alpha=0.1, color="#3b82f6")

ax.annotate("$320K", xy=(11, 320), fontsize=14, fontweight="bold", color="#3b82f6")
ax.annotate("$190K", xy=(11, 190), fontsize=12, color="#94a3b8")

ax.set_ylabel("Revenue ($K)", fontsize=12)
ax.set_title("Revenue grew 68% year-over-year", fontsize=16, fontweight="bold")
ax.legend(fontsize=12)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.grid(axis="y", alpha=0.3)
plt.tight_layout()
```

### Horizontal Bar Chart (Comparison)

```python
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use("Agg")

fig, ax = plt.subplots(figsize=(10, 6))

categories = ["Email", "Social", "SEO", "Paid Ads", "Referral", "Direct"]
values = [12, 18, 35, 22, 8, 5]
colors = ["#94a3b8"] * len(values)
colors[2] = "#3b82f6"  # Highlight the winner

# Sort by value
sorted_pairs = sorted(zip(values, categories, colors))
values, categories, colors = zip(*sorted_pairs)

ax.barh(categories, values, color=colors, height=0.6)
for i, v in enumerate(values):
    ax.text(v + 0.5, i, f"{v}%", va="center", fontsize=12, fontweight="bold")

ax.set_xlabel("% of Total Traffic", fontsize=12)
ax.set_title("SEO drives the most traffic", fontsize=16, fontweight="bold")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
plt.tight_layout()
```

### KPI / Big Number Card

For KPI cards, generate an HTML-based image using the image generation tool, or render the HTML structure and present it as formatted text in the conversation:

```html
<div style="display:flex;gap:20px;padding:20px;background:white;font-family:system-ui">
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;width:200px;text-align:center">
    <p style="color:#64748b;font-size:14px;margin:0">Monthly Revenue</p>
    <p style="font-size:48px;font-weight:900;margin:8px 0;color:#1e293b">$89K</p>
    <p style="color:#22c55e;font-size:14px;margin:0">↑ 23% vs last month</p>
  </div>
</div>
```

### Heatmap

```python
import matplotlib.pyplot as plt
import numpy as np
import matplotlib
matplotlib.use("Agg")

fig, ax = plt.subplots(figsize=(10, 6))

days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
hours = ["9AM", "10AM", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM", "5PM"]
data = np.random.randint(10, 100, size=(len(hours), len(days)))

im = ax.imshow(data, cmap="Blues", aspect="auto")
ax.set_xticks(range(len(days)))
ax.set_yticks(range(len(hours)))
ax.set_xticklabels(days, fontsize=12)
ax.set_yticklabels(hours, fontsize=12)

for i in range(len(hours)):
    for j in range(len(days)):
        color = "white" if data[i][j] > 60 else "black"
        ax.text(j, i, data[i][j], ha="center", va="center", fontsize=10, color=color)

ax.set_title("Website Traffic by Day & Hour", fontsize=16, fontweight="bold")
plt.colorbar(im, label="Visitors")
plt.tight_layout()
```

## Storytelling with Data

### The Narrative Arc

| Step | What to Do | Example |
|------|-----------|---------|
| 1. **Context** | Set up what the reader needs to know | "We track customer acquisition cost monthly" |
| 2. **Tension** | Show the problem or change | "CAC increased 40% in Q3" |
| 3. **Resolution** | Show the insight or solution | "But LTV increased 80%, so unit economics improved" |

### Title as Insight

```
❌ Descriptive titles (what the chart shows):
   "Q3 Revenue by Product Line"
   "Monthly Active Users 2024"
   "Customer Satisfaction Survey Results"

✅ Insight titles (what the chart means):
   "Enterprise product drives 70% of revenue growth"
   "User growth accelerated after the free tier launch"
   "Support response time is the #1 satisfaction driver"
```

### Annotation Techniques

| Technique | When to Use |
|-----------|------------|
| **Call-out label** | Highlight a specific data point ("Peak: 320K") |
| **Reference line** | Show target/benchmark ("Goal: 100K") |
| **Shaded region** | Mark a time period ("Product launch window") |
| **Arrow + text** | Draw attention to trend change |
| **Before/after line** | Show impact of an event |

## Dark Mode Charts

```python
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use("Agg")

# Dark theme
plt.rcParams.update({
    "figure.facecolor": "#0f172a",
    "axes.facecolor": "#0f172a",
    "axes.edgecolor": "#334155",
    "axes.labelcolor": "white",
    "text.color": "white",
    "xtick.color": "white",
    "ytick.color": "white",
    "grid.color": "#1e293b"
})

fig, ax = plt.subplots(figsize=(12, 6))
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
values = [45, 52, 58, 72, 85, 98]

ax.plot(months, values, color="#818cf8", linewidth=3, marker="o", markersize=8)
ax.fill_between(range(len(months)), values, alpha=0.15, color="#818cf8")
ax.set_title("MRR Growth: On track for $100K", fontsize=18, fontweight="bold")
ax.set_ylabel("MRR ($K)", fontsize=13)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.grid(axis="y", alpha=0.2)

for i, v in enumerate(values):
    ax.annotate(f"${v}K", (i, v), textcoords="offset points", xytext=(0, 12), ha="center", fontsize=11, fontweight="bold")

plt.tight_layout()
```

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Pie charts | Hard to compare, always misleading | Use bar charts or treemaps |
| Y-axis not starting at 0 (bar charts) | Exaggerates differences | Start at 0 for bars, OK to truncate for lines |
| Too many colors | Visual noise, confusing | Max 5-7 colors, highlight only what matters |
| No title or generic title | Reader doesn't know the insight | Title = the takeaway, not the data type |
| 3D charts | Distorts data, looks unprofessional | Always use 2D |
| Dual Y-axes | Misleading, hard to read | Use two separate charts |
| Alphabetical sort on bar charts | Hides the story | Sort by value (largest first) |
| No labels on axes | Reader can't interpret | Always label with units |
| Chartjunk (decorative elements) | Distracts from data | Remove everything that doesn't convey information |
| Red/green only for color coding | Colorblind users can't read | Use shapes, patterns, or colorblind-safe palettes |
