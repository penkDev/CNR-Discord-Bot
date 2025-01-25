# CNR-Discord-Bot

Discord bot designed for CNR crews to track and manage their Discord server.

## Features

- **Player Tracking**: Automatically tracks and updates player playtime.
- **UUID Linking**: Allows users to link their Discord accounts to their game UUIDs.
- **Leaderboards**: Displays top players based on playtime.
- **Moderation Tools**: Includes commands for warnings, message monitoring, and profanity filtering.

## Installation

1. **Clone the repository**:

    ```bash
    git clone https://github.com/yourusername/CNR-Discord-Bot.git
    cd CNR-Discord-Bot
    ```

2. **Install dependencies**:

    ```bash
    pip install -r requirements.txt
    ```

3. **Configure the bot**:

    - Rename `config.example.yml` to `config.yml`.
    - Add your Discord bot token and configure all of the empty fields

4. **Run the bot**:

    ```bash
    python main.py
    ```

## Configuration

The `config.yml` file contains the bot's configuration settings:

```yaml
database:
  name: players.db

endpoints:
  eu1: "https://api.gtacnr.net/cnr/players?serverId=EU1"
  eu2: "https://api.gtacnr.net/cnr/players?serverId=EU2"
  us1: "https://api.gtacnr.net/cnr/players?serverId=US1"
  us2: "https://api.gtacnr.net/cnr/players?serverId=US2"
  sea1: "https://api.gtacnr.net/cnr/players?serverId=SEA"

server_status_endpoint: "https://api.gtacnr.net/cnr/servers"

status_endpoints:
  'server_name EU1': 'https://57.129.49.31:30130/info.json'
  'server_name EU2': 'https://57.129.49.31:30131/info.json'
  'server_name US1': 'https://15.204.215.61:30130/info.json'
  'server_name US2': 'https://15.204.215.61:30131/info.json'
  'server_name SEA1': 'https://51.79.231.52:30130/info.json'

bottoken: bot_token_here

guild_id: serverID_here
staff_role_id: role_id_here
crewmember_role_id: role_id_here

online_users_channel_id: channel_id_here 
leaderboard_channel_id: channel_id_here 

cnr_status_channel_id: channel_id_here 

staff_logs_channel_id: channel_id_here

embed_images:
  linkuuid_thumbnail: "url"
  linking_error_thumbnail: "url"
  myuuid_thumbnail: "url"
  footer_thumbnail: "url"
  logs_thumbnail: "url"
```

## Commands

- `/playtime @user`: Displays the total playtime of the mentioned user.
- `/link <CNR_Username>`: Links your Discord account to your game UUID.
- `/resetleaderboard`: Resets the playtime of all users in the database back to 0
- `/mute <username> <reason> <duration>`: Timesout a discord member.
- `/kick <username> <reason>`: Kicks a specific member from the discord server.
- `/ban <username> <reason>`: Permamently bans a member from the discord server.
- `!sync`: Synchronises all the slash commands to the serverid provided in the config.

## Contribution

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the [GPL.3.0](https://github.com/penkDev/CNR-Discord-Bot?tab=License-1-ov-file).
## Contact

For any questions or support, please contact me on discord or create an issue on github. Discord Username: `penksi.`