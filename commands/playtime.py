import discord
from discord.ext import commands, tasks
from discord import app_commands
from datetime import datetime, timezone
import traceback

class Playtime(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='playtime', description='Displays the total playtime of a user.')
    @app_commands.describe(member='The member to get playtime for.')
    async def playtime(self, interaction: discord.Interaction, member: discord.Member):
        """Displays the total playtime of the mentioned user."""
        try:
            await interaction.response.defer()
            c = self.bot.conn.cursor()
            c.execute('SELECT uuid FROM discord_users WHERE discord_id = ?', (str(member.id),))
            link = c.fetchone()
            
            if not link:
                await interaction.followup.send(f"{member.display_name} has not linked their UUID. Use `/linkuuid` to link.")
                return
            
            uuid = link[0]
            
            c.execute('SELECT playtime FROM players WHERE uid = ?', (uuid, ))
            result = c.fetchone()
        
            if result:
                playtime_seconds = result[0]
                playtime_formatted = self.convert_seconds_to_hms(playtime_seconds)
                embed = discord.Embed(
                    title=f"📊 {member.display_name}'s Playtime",
                    color=0x00FF00,
                    timestamp=datetime.now(timezone.utc)
                )
                embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url if interaction.user.display_avatar else None)
                embed.add_field(name='Total Playtime', value=playtime_formatted, inline=False)
                embed.set_footer(
                    text="CNR Crew Bot by penk", 
                    icon_url=self.bot.LOGS_THUMBNAIL
                )
                await interaction.followup.send(embed=embed)
            else:
                embed = discord.Embed(
                    title="❓ No recorded playtime",
                    description=f"{member.display_name} has no recorded playtime.",
                    color=0xFFA500,
                    timestamp=datetime.now(timezone.utc)
                )
                embed.set_footer(
                    text="CNR Crew Bot by penk", 
                    icon_url=self.bot.LOGS_THUMBNAIL 
                )
                await interaction.followup.send(embed=embed)
        except Exception as e:
            traceback.print_exc()
            await interaction.followup.send("An error occurred while retrieving playtime.")

    @playtime.error
    async def playtime_error(self, interaction: discord.Interaction, error):
        if isinstance(error, discord.app_commands.errors.MissingPermissions):
            await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
        else:
            await interaction.response.send_message("An error occurred while processing the playtime command.", ephemeral=True)

    @app_commands.command(name='link', description='Link your Discord account to the specified game username.')
    @app_commands.describe(username='The username to link with your Discord account.')
    async def link(self, interaction: discord.Interaction, username: str):
        try:
            await interaction.response.defer()
            c = self.bot.conn.cursor()
            c.execute('SELECT uid FROM players WHERE username = ?', (username, ))
            result = c.fetchone()

            if not result:
                await interaction.followup.send(f"No UUID found for username '{username}'.", ephemeral=True)
                return

            uuid = result[0]
            discord_id = str(interaction.user.id)

            # Check if UUID is already linked
            c.execute('SELECT discord_id FROM discord_users WHERE uuid = ?', (uuid, ))
            existing = c.fetchone()
            if existing and existing[0] != discord_id:
                await interaction.followup.send("That username is already linked to another Discord account.", ephemeral=True)
                return

            # Link the UUID to this Discord ID
            c.execute('''
                INSERT INTO discord_users (discord_id, uuid)
                VALUES (?, ?)
                ON CONFLICT(discord_id) DO UPDATE SET uuid=excluded.uuid
            ''', (discord_id, uuid))
            self.bot.conn.commit()

            embed = discord.Embed(
                title="✅ Successfully Linked",
                description=f"Your account is now linked to **{username}**.",
                color=0x00FF00
            )
            embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
            await interaction.followup.send(embed=embed, ephemeral=True)

        except Exception as e:
            traceback.print_exc()
            await interaction.followup.send("❌ An error occurred while linking the username.", ephemeral=True)

    @link.error
    async def link_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.CheckFailure):
            await interaction.response.send_message(str(error), ephemeral=True)
        else:
            await interaction.response.send_message("An error occurred while linking your UUID.", ephemeral=True)

    async def staff_check_reset(interaction: discord.Interaction) -> bool:
        """Check if user has the staff role for reset command."""
        bot = interaction.client
        staff_role_id = bot.config.get('staff_role_id')
        if staff_role_id and any(role.id == int(staff_role_id) for role in interaction.user.roles):
            return True
        raise app_commands.CheckFailure("You need staff permissions to use this command.")

    @app_commands.command(name='resetleaderboard', description='Reset all players\' playtime to 0 (Staff only).')
    @app_commands.check(staff_check_reset)
    async def reset_leaderboard(self, interaction: discord.Interaction):
        """Reset all players' playtime to 0."""
        try:
            await interaction.response.defer(ephemeral=True)
            c = self.bot.conn.cursor()
            c.execute('UPDATE players SET playtime = 0')
            self.bot.conn.commit()
            await interaction.followup.send("✅ All player playtimes have been reset to 0.", ephemeral=True)
        except Exception as e:
            traceback.print_exc()
            await interaction.followup.send("❌ An error occurred while resetting playtimes.", ephemeral=True)

    @reset_leaderboard.error
    async def reset_leaderboard_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.CheckFailure):
            if not interaction.response.is_done():
                await interaction.response.send_message(str(error), ephemeral=True)
            else:
                await interaction.followup.send(str(error), ephemeral=True)
        else:
            if not interaction.response.is_done():
                await interaction.response.send_message("An error occurred while resetting the leaderboard.", ephemeral=True)
            else:
                await interaction.followup.send("An error occurred while resetting the leaderboard.", ephemeral=True)

    async def staff_check(interaction: discord.Interaction) -> bool:
        """Check if user has the staff role."""
        bot = interaction.client
        staff_role_id = bot.config.get('staff_role_id')
        if staff_role_id and any(role.id == int(staff_role_id) for role in interaction.user.roles):
            return True
        raise app_commands.CheckFailure("You need staff permissions to use this command.")

    @app_commands.command(name='listallmembers', description='Lists all linked members with their playtime.')
    @app_commands.check(staff_check)
    async def list_all_members(self, interaction: discord.Interaction):
        """Lists all linked members with their playtime."""
        try:
            await interaction.response.defer()
            c = self.bot.conn.cursor()
            
            # Query to get all linked users with their playtime and username
            c.execute('''
                SELECT p.username, p.playtime, d.discord_id
                FROM players p
                JOIN discord_users d ON p.uid = d.uuid
                ORDER BY p.playtime DESC
            ''')
            
            all_players = c.fetchall()
            
            if not all_players:
                await interaction.followup.send("No linked members found.")
                return
            
            # Send an initial message
            await interaction.followup.send(f"Found {len(all_players)} linked members. Generating list...")
            
            # Split players into chunks for pagination (max 15 players per embed)
            chunks = [all_players[i:i+15] for i in range(0, len(all_players), 15)]
            
            for page_num, chunk in enumerate(chunks, start=1):
                embed = discord.Embed(
                    title=f"💻 All Linked Members (Page {page_num}/{len(chunks)})",
                    color=0x00BFFF,
                    timestamp=datetime.now(timezone.utc)
                )
                
                player_list = ""
                for i, (username, playtime, discord_id) in enumerate(chunk, start=1 + (page_num-1)*15):
                    playtime_formatted = self.convert_seconds_to_hms(playtime)
                    discord_name = f"<@{discord_id}>"
                    
                    player_list += f"**{i}. {username}** - {playtime_formatted} ({discord_name})\n"
                
                embed.description = player_list
                embed.set_footer(text=f"CNR Crew Bot by penk | Page {page_num}/{len(chunks)}", icon_url=self.bot.LOGS_THUMBNAIL)
                
                await interaction.channel.send(embed=embed)
                
        except Exception as e:
            traceback.print_exc()
            await interaction.followup.send("An error occurred while retrieving member list.")

    @list_all_members.error
    async def list_all_members_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.CheckFailure):
            await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
        else:
            await interaction.response.send_message("An error occurred while processing the command.", ephemeral=True)

    def convert_seconds_to_hms(self, seconds):
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        return f"{int(hours)}h {int(minutes)}m {int(secs)}s"

async def setup(bot):
    await bot.add_cog(Playtime(bot))