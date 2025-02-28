import discord
from discord.ext import commands
from discord import ButtonStyle, Embed
import random
import string
from PIL import Image, ImageDraw, ImageFont
import io
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import traceback
import sqlite3

def random_string():
    """Generate a random 5-character string for the captcha."""
    N = 5
    s = string.ascii_uppercase + string.ascii_lowercase + string.digits
    return ''.join(random.choices(s, k=N))

def getit():
    """Get a random coordinate for drawing lines/points in the captcha."""
    return (random.randrange(5, 85), random.randrange(5, 55))

# Colors for captcha text and noise
colors = ["black", "red", "blue", "green", (64,107,76), (0,87,128), (0,3,82)]
fill_color = [(64,107,76), (0,87,128), (0,3,82), (191,0,255), (72,189,0), (189,107,0), (189,41,0)]

def gen_captcha_img():
    """Generate a captcha image and the corresponding string."""
    img = Image.new('RGB', (90, 60), color="white")
    draw = ImageDraw.Draw(img)
    captcha_str = random_string()
    text_colors = random.choice(colors)
    font_name = "arial.ttf"  # Ensure this font is available
    try:
        font = ImageFont.truetype(font_name, 18)
    except IOError:
        font = ImageFont.load_default()
    draw.text((20, 20), captcha_str, fill=text_colors, font=font)

    # Add random lines for noise
    for i in range(5, random.randrange(6, 10)):
        draw.line((getit(), getit()), fill=random.choice(fill_color), width=random.randrange(1, 3))

    # Add random points for noise
    for i in range(10, random.randrange(11, 20)):
        draw.point((getit(), getit()), fill=random.choice(colors))

    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)

    return buffer, captcha_str

class VerificationView(discord.ui.View):
    """View containing the verification button."""
    def __init__(self, bot):
        super().__init__(timeout=None)
        self.bot = bot

    @discord.ui.button(label="Verify", style=discord.ButtonStyle.green, custom_id="verify_button")
    async def verify_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        user = interaction.user
        embed = discord.Embed(
            title="Verification Started",
            description="The verification process has started. Check your DMs.",
            color=discord.Color.blue()
        )
        
        # Get logo URL from config
        if 'verification' in self.bot.config and 'logo_url' in self.bot.config['verification']:
            embed.set_thumbnail(url=self.bot.config['verification']['logo_url'])
            
        await interaction.response.send_message(embed=embed, ephemeral=True)
        await self.bot.get_cog("VerificationCog").verify_user(user)

class VerificationCog(commands.Cog):
    """Cog for handling user verification with captchas."""
    def __init__(self, bot):
        self.bot = bot
        
        # Check if verification is enabled in config
        if 'verification' not in bot.config or not bot.config['verification'].get('enabled', False):
            self.enabled = False
            return
            
        self.enabled = True
        self.config = bot.config['verification']
        self.channel_id = int(self.config['verification_channel_id'])
        self.verified_role_id = int(self.config['verified_role_id'])
        self.logo_url = self.config['logo_url']
        self.scheduler = AsyncIOScheduler()
        self.verification_message = None
        
        # Set up verification_message table if it doesn't exist
        conn = self.bot.conn
        cursor = conn.cursor()
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS verification_message (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    message_id INTEGER,
                    channel_id INTEGER
                )
            ''')
            conn.commit()
        except sqlite3.OperationalError as e:
            print(f"Error setting up verification table: {e}")
            traceback.print_exc()

    @commands.Cog.listener()
    async def on_ready(self):
        """Set up verification message when bot starts."""
        if not self.enabled:
            return
            
        await self.check_and_send_verification_message()
        self.scheduler.start()

    async def check_and_send_verification_message(self):
        """Check if verification message exists, if not create one."""
        try:
            channel = self.bot.get_channel(self.channel_id)
            if not channel:
                print(f"Verification channel {self.channel_id} not found")
                return
                
            cursor = self.bot.conn.cursor()
            cursor.execute('SELECT message_id FROM verification_message WHERE id = 1')
            result = cursor.fetchone()
            
            view = VerificationView(self.bot)
            embed = discord.Embed(
                title="Verify Your Account",
                description="Click the button below to verify with our Discord server.",
                color=discord.Color.blue()
            )
            embed.add_field(
                name="Instructions",
                value="Await a DM from the bot after clicking the Verify button.",
                inline=False
            )
            embed.set_footer(text="Verification may take a moment.")
            embed.set_thumbnail(url=self.logo_url)
            
            if result:
                message_id = result[0]
                try:
                    # Try to get the existing message
                    message = await channel.fetch_message(message_id)
                    # Update the existing message
                    await message.edit(embed=embed, view=view)
                    self.verification_message = message
                    return
                except discord.NotFound:
                    # Message not found, will create a new one
                    pass
            
            # Create a new verification message
            new_message = await channel.send(embed=embed, view=view)
            self.verification_message = new_message
            
            # Save the message ID
            if result:
                cursor.execute('UPDATE verification_message SET message_id = ? WHERE id = 1', (new_message.id,))
            else:
                cursor.execute('INSERT INTO verification_message (id, message_id, channel_id) VALUES (1, ?, ?)',
                              (new_message.id, self.channel_id))
            self.bot.conn.commit()
            
        except Exception as e:
            print(f"Error setting up verification message: {e}")
            traceback.print_exc()

    async def verify_user(self, user: discord.Member):
        """Process verification for a user with captcha."""
        if not self.enabled:
            return
            
        try:
            # Generate captcha
            buffer, captcha_str = gen_captcha_img()
            
            # Send captcha to user
            embed = discord.Embed(
                title="Captcha Verification",
                description="Please type the characters shown in the image below to verify your account.",
                color=discord.Color.blue()
            )
            embed.set_thumbnail(url=self.logo_url)
            embed.add_field(
                name="Instructions",
                value="Type the characters exactly as shown. The captcha is case-sensitive.",
                inline=False
            )
            embed.set_footer(text="You have 5 minutes to complete this verification.")
            
            # Create a copy of the buffer for the file
            file_buffer = io.BytesIO()
            buffer.seek(0) 
            file_buffer.write(buffer.read())
            file_buffer.seek(0) 
            
            # Send the captcha image as a file with the embed
            captcha_file = discord.File(fp=file_buffer, filename='captcha.png')
            
            try:
                await user.send(embed=embed, file=captcha_file)
            except discord.Forbidden:
                # User has DMs disabled
                error_embed = discord.Embed(
                    title="Verification Failed",
                    description="Please enable DMs from server members to verify.",
                    color=discord.Color.red()
                )
                error_embed.set_thumbnail(url=self.logo_url)
                guild_channel = self.bot.get_channel(self.channel_id)
                await guild_channel.send(content=user.mention, embed=error_embed, delete_after=10)
                return

            def check(m):
                return m.author == user and isinstance(m.channel, discord.DMChannel)

            try:
                msg = await self.bot.wait_for('message', check=check, timeout=300)
                
                # Check if captcha is correct
                if msg.content.strip() != captcha_str:
                    embed = discord.Embed(
                        title="Incorrect Captcha",
                        description="Verification failed. Please try again.",
                        color=discord.Color.red()
                    )
                    embed.set_thumbnail(url=self.logo_url)
                    await user.send(embed=embed)
                    return
                    
            except asyncio.TimeoutError:
                embed = discord.Embed(
                    title="Timeout",
                    description="Verification failed due to timeout.",
                    color=discord.Color.red()
                )
                embed.set_thumbnail(url=self.logo_url)
                await user.send(embed=embed)
                return

            # Verification successful, add role
            verified_role = user.guild.get_role(self.verified_role_id)
            if verified_role:
                await user.add_roles(verified_role)
                
                # Log verification to staff logs if configured
                if hasattr(self.bot, 'LOG_CHANNEL_ID'):
                    log_channel = self.bot.get_channel(self.bot.LOG_CHANNEL_ID)
                    if log_channel:
                        log_embed = discord.Embed(
                            title="User Verified",
                            description=f"{user.mention} ({user.name}) has been verified.",
                            color=discord.Color.green(),
                            timestamp=discord.utils.utcnow()
                        )
                        log_embed.set_footer(text="CNR Crew Bot by penk", icon_url=self.bot.LOGS_THUMBNAIL)
                        await log_channel.send(embed=log_embed)
                
                embed = discord.Embed(
                    title="Verification Successful",
                    description="You have been verified!",
                    color=discord.Color.green()
                )
                embed.set_thumbnail(url=self.logo_url)
                await user.send(embed=embed)
            else:
                embed = discord.Embed(
                    title="Role Not Found",
                    description="Please contact an admin to set up the verified role.",
                    color=discord.Color.red()
                )
                embed.set_thumbnail(url=self.logo_url)
                await user.send(embed=embed)
                
        except Exception as e:
            print(f"Error in verification process: {e}")
            traceback.print_exc()
            
            try:
                embed = discord.Embed(
                    title="Error",
                    description="An error occurred during verification. Contact an admin.",
                    color=discord.Color.red()
                )
                embed.set_thumbnail(url=self.logo_url)
                await user.send(embed=embed)
            except:
                pass

async def setup(bot):
    """Add the verification cog to the bot if enabled."""
    if 'verification' in bot.config and bot.config['verification'].get('enabled', False):
        await bot.add_cog(VerificationCog(bot))
    else:
        print("Verification module is disabled in config")
