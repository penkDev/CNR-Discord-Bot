# CNR-Discord-Bot

Discord bot for CNR crews to track and manage their Discord server. Written in Node.js with discord.js.

## Features

- **Player tracking**: polls the CNR API every minute and tracks playtime per player.
- **UUID linking**: members link their Discord account to their game username (crewmember role required).
- **Online embeds and leaderboard**: one live embed per server and a top 10 playtime leaderboard, both edited in place.
- **Moderation**: `/kick`, `/ban`, `/mute`, `/warn` with role hierarchy checks, warning history and an automatic timeout when a member reaches a configurable number of warnings.
- **Profanity filter and message monitoring**: deletes messages with listed words in the monitored channel and logs deleted and edited messages to the staff log.
- **Verification**: captcha image, answered through a popup form. Can be disabled in the config.

## Requirements

- Node.js 26 or newer
- A Discord application with a bot token
- In the Discord developer portal under *Bot*, enable the privileged intents **Server Members Intent** and **Message Content Intent**
- Bot permissions: View Channels, Send Messages, Embed Links, Manage Messages, Manage Roles, Kick Members, Ban Members, Moderate Members. For verification the bot role must be above the verified role.

The captcha text is drawn with a system font (Arial, DejaVu Sans, Liberation Sans or Helvetica). On a minimal Linux server install one of them, for example `fonts-dejavu-core`.

## Installation

```bash
git clone https://github.com/penkDev/CNR-Discord-Bot.git
cd CNR-Discord-Bot
npm install
cp config.example.yml config.yml
```

Fill in `config.yml`, then start the bot:

```bash
npm start
```

Slash commands are registered in your guild on every start. Run `npm test` to run the tests.

An existing `players.db` from the Python version keeps working. Copy it into the project folder (or point `database.name` at it). The bot adds the new `warnings` table on first start.

## Configuration

Copy `config.example.yml` to `config.yml` (it is gitignored). The bot refuses to start and lists every problem if the token, `guild_id`, `staff_role_id`, `crewmember_role_id`, `server_status_endpoint` or `endpoints` are missing or still placeholders.

| Key | Description |
|---|---|
| `database.name` | SQLite file, relative to the project folder |
| `endpoints` | CNR player list URL per server (`eu1`, `eu2`, `us1`, `us2`, `sea1`) |
| `server_status_endpoint` | CNR endpoint with player count and queue |
| `status_endpoints` | Per server `info.json` used for the restart countdown, keyed `'server_name EU1'` |
| `bottoken`, `guild_id`, `staff_role_id`, `crewmember_role_id` | Required |
| `online_users_channel_id`, `leaderboard_channel_id`, `staff_logs_channel_id`, `monitored_channel_id` | Optional, a feature without its channel is skipped |
| `embed_images.footer_thumbnail`, `embed_images.logs_thumbnail` | Footer icons, default to a built in image |
| `verification.*` | `enabled`, `verification_channel_id`, `verified_role_id`, `logo_url` |
| `moderation.warn_timeout_threshold` | Warnings after which a member is timed out automatically (default 3) |
| `moderation.warn_timeout_minutes` | Length of that timeout, 1 to 40320 (default 60) |
| `moderation.profanity.enabled` / `words` | Profanity filter for `monitored_channel_id`, whole word and case insensitive |

IDs can be written with or without quotes.

## Commands

| Command | Who | Description |
|---|---|---|
| `/playtime member` | everyone | Total playtime of a linked member |
| `/link username` | crewmember role | Link your Discord account to a game username |
| `/unlink member` | Manage Roles | Remove a link |
| `/removelinks` | Manage Roles | Unlink everyone who lost the crewmember role or left the server |
| `/listallmembers` | staff role | Paginated list of all linked members with playtime |
| `/resetleaderboard` | staff role | Set all playtimes to 0 |
| `/kick member reason` | Kick Members | Kick a member |
| `/ban member reason` | Ban Members | Ban a member |
| `/mute member reason duration` | Moderate Members | Time a member out for 1 minute up to 1 week |
| `/warn member reason` | Moderate Members | Warn a member, times them out at the configured threshold |
| `/warnings member` | Moderate Members | Show the latest 10 warnings and the total |
| `/clearwarnings member` | Moderate Members | Delete all warnings (a running timeout stays) |

Moderation commands refuse to act on the server owner, the bot, yourself, or anyone whose highest role is not below yours.

## Contribution

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the [GPL.3.0](https://github.com/penkDev/CNR-Discord-Bot?tab=License-1-ov-file).
## Contact

For any questions or support, please contact me on discord or create an issue on github. Discord Username: `penksi.`