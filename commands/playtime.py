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
            
            c.execute('SELECT playtime FROM players WHERE uid = ?', (uuid,))
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

    @app_commands.command(name='myuuid', description='Displays the UUID linked to a specified username.')
    @app_commands.describe(username='The username to retrieve the UUID for.')
    async def myuuid(self, interaction: discord.Interaction, username: str):
        """Displays the UUID linked to the specified username."""
        try:
            await interaction.response.defer()
            c = self.bot.conn.cursor()
            c.execute('SELECT uid, server FROM players WHERE username = ?', (username,))
            result = c.fetchone()
            
            if result:
                uuid, server = result
                embed = discord.Embed(
                    title=f"🔗 UUID for `{username}`",
                    description=f"**UUID:** `{uuid}`",
                    color=0x1ABC9C,
                    timestamp=datetime.now(timezone.utc)
                )
                embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url if interaction.user.display_avatar else None)
                embed.add_field(name="📍 Server", value=server.capitalize(), inline=True)
                embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
                embed.set_thumbnail(url=self.bot.MYUUID_THUMBNAIL)
                await interaction.followup.send(embed=embed)
            else:
                embed = discord.Embed(
                    title="❌ UUID Not Found",
                    description=f"No UUID found for username `{username}`.",
                    color=0xE74C3C,
                    timestamp=datetime.now(timezone.utc)
                )
                embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
                await interaction.followup.send(embed=embed)
        except Exception as e:
            traceback.print_exc()
            embed = discord.Embed(
                title="⚠️ Error",
                description="An error occurred while retrieving the UUID. Please try again later.",
                color=0xE74C3C,
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
            await interaction.followup.send(embed=embed)

    @myuuid.error
    async def myuuid_error(self, interaction: discord.Interaction, error):
        if isinstance(error, discord.app_commands.errors.CommandInvokeError):
            await interaction.response.send_message("Failed to retrieve UUID. Please ensure the username is correct.", ephemeral=True)
        else:
            await interaction.response.send_message("An unexpected error occurred.", ephemeral=True)

    @app_commands.command(name='linkuuid', description='Link your Discord account to your game UUID.')
    @app_commands.describe(uuid='Your game UUID to link with your Discord account.')
    @app_commands.checks.has_permissions(moderate_members=True)  # Adjust permissions as needed
    async def linkuuid(self, interaction: discord.Interaction, uuid: str):
        """Link your Discord account to your game UUID."""
        try:
            c = self.bot.conn.cursor()
            discord_id = str(interaction.user.id)
            
            c.execute('SELECT uid FROM players WHERE uid = ?', (uuid,))
            player = c.fetchone()
            if not player:
                await interaction.response.send_message("The provided UUID does not exist in our records.", ephemeral=True)
                return
            
            c.execute('SELECT discord_id FROM discord_users WHERE uuid = ?', (uuid,))
            existing = c.fetchone()
            if existing:
                await interaction.response.send_message("This UUID is already linked to another Discord account.", ephemeral=True)
                return
            
            c.execute('''
                INSERT INTO discord_users (discord_id, uuid)
                VALUES (?, ?)
                ON CONFLICT(discord_id) DO UPDATE SET uuid=excluded.uuid
            ''', (discord_id, uuid))
            self.bot.conn.commit()
            
            embed = discord.Embed(
                title="✅ Successfully Linked",
                description="Your Discord account has been successfully linked to your UUID.",
                color=0x00FF00,
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url if interaction.user.display_avatar else None)
            embed.add_field(name='Linked UUID', value=uuid, inline=False)
            embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
            await interaction.response.send_message(embed=embed, ephemeral=True)
        except app_commands.CheckFailure as e:
            await interaction.response.send_message(str(e), ephemeral=True)
        except Exception as e:
            embed = discord.Embed(
                title="❌ Linking Error",
                description="An error occurred while linking your UUID. Please try again.",
                color=0xFF0000,
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url if interaction.user.display_avatar else None)
            embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
            await interaction.response.send_message(embed=embed, ephemeral=True)

    @linkuuid.error
    async def linkuuid_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.CheckFailure):
            await interaction.response.send_message(str(error), ephemeral=True)
        else:
            await interaction.response.send_message("An error occurred while linking your UUID.", ephemeral=True)

    @app_commands.command(name='resetleaderboard', description='Reset all players\' playtime to 0 (Staff only).')
    @app_commands.default_permissions(administrator=True)
    async def reset_leaderboard(self, interaction: discord.Interaction):
        """Reset all players' playtime to 0."""
        try:
            c = self.bot.conn.cursor()
            c.execute('UPDATE players SET playtime = 0')
            self.bot.conn.commit()
            await interaction.response.send_message("✅ All player playtimes have been reset to 0.", ephemeral=True)
        except Exception as e:
            traceback.print_exc()
            await interaction.response.send_message("❌ An error occurred while resetting playtimes.", ephemeral=True)

    @reset_leaderboard.error
    async def reset_leaderboard_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.CheckFailure):
            await interaction.response.send_message(str(error), ephemeral=True)
        else:
            await interaction.response.send_message("An error occurred while resetting the leaderboard.", ephemeral=True)

    def convert_seconds_to_hms(self, seconds):
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        return f"{int(hours)}h {int(minutes)}m {int(secs)}s"

async def setup(bot):
    await bot.add_cog(Playtime(bot))
