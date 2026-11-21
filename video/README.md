# Homepage hero film

The homepage plays a short film over the hero once per visit, then fades to the
regular "Where the sky meets the earth" hero. Until these files exist, the film
layer removes itself and the homepage looks exactly as it does without it.

## Files the homepage looks for

| File | Required | Notes |
| --- | --- | --- |
| `hero-film.mp4` | Yes | H.264, plays everywhere |
| `hero-film.webm` | Optional | VP9, smaller, used by Chrome/Firefox if present |
| `hero-film-poster.jpg` | Recommended | First frame, shown while the video loads |

## Target specs

- 1920×1080 (16:9), 24 or 30 fps
- 20–30 seconds
- No audio needed (it always plays muted)
- Under ~8 MB for the MP4 (CRF ~26, `-preset slow`, `-movflags +faststart`)
- Keep the key action in the middle half of the frame: on phones held upright,
  the left and right edges get cropped
- End on a dark frame (night sky works well) so the fade into the hero is seamless

## Behavior

- Autoplays muted, once per browser session; "Watch the film" under the hero buttons replays it
- "Skip film" button and the Esc key end it early
- Not autoplayed for visitors with reduced motion turned on (no film at all) or with data saver turned on (replay button only)

To swap in a new cut, replace the files with the same names. No code changes needed.
