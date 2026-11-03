# Recipe Lens (family web app)

Photograph a recipe on your phone and Claude reads out the ingredients, timings and method. Everyone in the family shares one recipe box. Nobody needs a Claude account: there's one shared **family code** instead.

## What it's made of

| Part | What it does | Cost |
|---|---|---|
| **Vercel** (Hobby plan) | Hosts the app and runs the small server code in `api/` | Free |
| **Upstash Redis** (added from inside Vercel) | Stores the recipes and photos | Free up to 256 MB, about 3,000 recipes |
| **Anthropic API** | Claude reads the photos | Pay as you go, see below |

### What Claude costs

The app uses Claude Opus 5.5 at low effort. A one-page recipe costs roughly **4–6p** to read. A correction ("step 3 should be 180°C") costs about 2p. Opening, searching and cooking from saved recipes costs nothing.

To spend less, set `CLAUDE_MODEL` (step 3) to `claude-sonnet-5-5` (about 2p a scan) or `claude-haiku-5-5` (well under 1p). The cheaper models are slightly more likely to misread messy handwriting.

## Setup (about 30 minutes, no coding)

### 1. Get an Anthropic API key

1. Go to [platform.claude.com](https://platform.claude.com) and sign up.
2. Under **Billing**, add credit. £5 covers about 100 scans.
3. Under **Limits**, set a monthly spend limit, for example £5, so the cost can never run away.
4. Under **API keys**, create a key named `recipe-lens`. Copy it somewhere safe: it's shown only once.

### 2. Put the code on GitHub

1. Sign up at [github.com](https://github.com).
2. Create a **new private repository** called `recipe-lens`.
3. On the empty repository page, choose **uploading an existing file**. Drag in everything inside this `recipe-lens-web` folder, including the `api` folder. Then **Commit changes**.

(Claude can do this step for you with git if you prefer: ask it to "push recipe-lens-web to my GitHub repo".)

### 3. Deploy on Vercel

1. Sign up at [vercel.com](https://vercel.com) with **Continue with GitHub**. Choose the free **Hobby** plan.
2. Choose **Add New → Project** and import the `recipe-lens` repository.
3. Before deploying, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | The key from step 1 |
   | `FAMILY_CODE` | A phrase your family will type once, e.g. `blue-teapot-sunday`. Use a few words: anyone with the code and the link can use your Claude credit. |
   | `CLAUDE_MODEL` | *(optional)* `claude-sonnet-5-5` or `claude-haiku-5-5` to spend less |

4. Choose **Deploy**. You'll get a link like `recipe-lens-yourname.vercel.app`.

### 4. Add the recipe database

1. In your Vercel project, open the **Storage** tab.
2. Choose **Create Database → Upstash → Upstash for Redis**, pick the **Free** plan and the region nearest you (e.g. London), and create it.
3. When asked, **Connect** it to the `recipe-lens` project. This adds the database settings for you.
4. Open the **Deployments** tab, choose the **⋯** menu on the latest deployment, then **Redeploy**, so the app picks up the database.

### 5. Use it

1. Open your Vercel link on your phone, type your name and the family code.
2. Add it to your home screen: in Chrome, **⋮ → Add to Home screen**; in Safari, **Share → Add to Home Screen**. It then opens like an app.
3. Send the family the link and the code.

## Day to day

- **Scan:** tap the camera button, photograph each page, then **Read recipe**. Check it, then **Save to family recipes**.
- **Find:** search by name or ingredient, filter by favourites, your own recipes or a tag, and sort by newest, A–Z, recently cooked, most cooked or quickest.
- **Cook:** **Start cooking** shows one step at a time in large text and keeps the screen on. Finishing marks the recipe as cooked.
- **Fix a mistake:** type the correction under **Something wrong?** on the recipe.
- Everyone sees the same recipes, favourites and cooking history. Deleting a recipe deletes it for everyone.

## Changing the family code

Change `FAMILY_CODE` in Vercel (**Settings → Environment Variables**), then redeploy. Everyone is asked for the new code the next time they open the app.

## If something goes wrong

| Message | Fix |
|---|---|
| "The recipe database isn't connected yet" | Do step 4, including the redeploy. |
| "ANTHROPIC_API_KEY isn't set" or "…key is missing or wrong" | Check the key in Vercel's environment variables, then redeploy. |
| "Claude couldn't take this request: … credit balance …" | Add credit at platform.claude.com. |
| "That family code isn't right" | Check the code, including capitals and spaces. |

Server errors are listed in Vercel under your project → **Logs**.

## Files

- `index.html`: the whole app page.
- `api/read.js`: sends the photos to Claude and returns the recipe.
- `api/fix.js`: applies a correction to a recipe.
- `api/recipes.js`: lists, saves, updates and deletes recipes.
- `api/photo.js`: returns a recipe's large photo.
- `api/_lib.js`: shared code (family code check, database, Claude, the reading instructions).
