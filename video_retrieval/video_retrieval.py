import click
import os
import requests
from datetime import datetime
import subprocess
import json
import backoff

# Constants for API URLs
S3_API_URL = "https://o28an1f9e8.execute-api.us-east-2.amazonaws.com/prod"
CREATE_VIDEO_METADATA_URL = "https://vie8q37y20.execute-api.us-east-2.amazonaws.com/prod/createVideoMetadata"

# Function to create directories safely
def create_directory(path):
    if not os.path.exists(path):
        os.makedirs(path)

# Function to check if the file size is valid
def is_file_size_valid(file_path, max_size_mb=50):
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)  # Convert bytes to MB
    return file_size_mb <= max_size_mb


def open_chrome_and_copy_text(url):
    """
    Opens Chrome, navigates to the specified URL, and fetches the page content using AppleScript.
    """
    # AppleScript to navigate to the URL and fetch content
    apple_script = f"""
        tell application "Google Chrome"
            activate
            open location "{url}"
            delay 2 -- Wait for the page to load
            set pageContent to execute front window's active tab javascript "document.body.innerText"
            return pageContent
        end tell
    """
    try:
        # Execute AppleScript
        result = subprocess.run(
            ["osascript", "-e", apple_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running AppleScript: {e.stderr}")
        return None

# Function to crop video
def crop_video(file_path):
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,bit_rate",
        "-of", "csv=p=0",
        file_path
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        width, height, bit_rate = map(int, result.stdout.strip().split(","))
    except ValueError as e:
        print(f"Open the {file_path}, it'll show you the error with the download mp4. {' '.join(cmd)} {result=} {e}")
        raise

    if height > width:
        crop_height = int(height * 0.7)
        crop_width = width
    else:
        crop_width = crop_height = min(width, height)

    x_offset = (width - crop_width) // 2
    y_offset = (height - crop_height) // 2

    output_path = file_path.replace(".mp4", "_cropped.mp4")

    cmd = [
        "ffmpeg",
        "-i", file_path,
        "-vf", f"crop={crop_width}:{crop_height}:{x_offset}:{y_offset}",
        "-c:v", "libx264",
        "-preset", "slower",
        "-crf", "25",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
        "-y",
    ]
    subprocess.run(cmd, check=True)
    return output_path


@backoff.on_exception(backoff.constant, Exception, interval=60, max_tries=3)
def download_video_ssstik(video_info, save_folder):
    """
    Download a video from ssstik and ensure the file exists after downloading.
    Retries up to 3 times with a 60-second wait between each attempt.
    """
    id = video_info["id"]
    username = video_info["author"]["uniqueId"]

    request_url = f"https://tikcdn.io/ssstik/{id}"

    # Construct the save folder path
    date = datetime.now().strftime("%Y-%m-%d")
    save_folder = os.path.expanduser(f"~/Documents/tiktok/{date}/{save_folder}")
    create_directory(save_folder)

    # Construct the save path
    save_path = os.path.join(save_folder, f"{id}.mp4")
    print(f"Downloading video from {request_url} to {save_path}")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36"
    }

    # Perform the download
    video_response = requests.get(request_url, stream=True, headers=headers)
    video_response.raise_for_status()
    with open(save_path, "wb") as f:
        for chunk in video_response.iter_content(chunk_size=8192):
            f.write(chunk)

    # Check if the file exists and raise an exception if it does not
    if not os.path.exists(save_path):
        raise FileNotFoundError(f"Download failed: {save_path} does not exist.")

    # Check if the file is empty
    if os.path.getsize(save_path) == 0:
        raise ValueError(f"Download failed: {save_path} is empty (0 bytes).")

    return save_path

def get_videos_by_hashtags(hashtags):
    """
    Fetch videos by iterating over a list of hashtags and substituting the `keyword` parameter in the TikTok API URL.
    """

    base_url = "https://www.tiktok.com/api/search/general/full/?WebIdLastTime=1714615161&aid=1988&app_language=en&app_name=tiktok_web&browser_language=en-US&browser_name=Mozilla&browser_online=true&browser_platform=MacIntel&browser_version=5.0%20%28Macintosh%3B%20Intel%20Mac%20OS%20X%2010_15_7%29%20AppleWebKit%2F537.36%20%28KHTML%2C%20like%20Gecko%29%20Chrome%2F131.0.0.0%20Safari%2F537.36&channel=tiktok_web&cookie_enabled=true&data_collection_enabled=true&device_id=7364215944284522026&device_platform=web_pc&device_type=web_h264&focus_state=true&from_page=search&history_len=5&is_fullscreen=false&is_page_visible=true&keyword={keyword}&odinId=6954213178439959557&offset=0&os=mac&priority_region=US&referer=&region=US&root_referer=https%3A%2F%2Fwww.google.com%2F&screen_height=1117&screen_width=1728&search_source=normal_search&tz_name=America%2FLos_Angeles&user_is_login=true&verifyFp=verify_m53p8ikx_KOhUdB6j_lPRa_4r4o_BVtZ_qcLAwGDmc94d&web_search_code=%7B%22tiktok%22%3A%7B%22client_params_x%22%3A%7B%22search_engine%22%3A%7B%22ies_mt_user_live_video_card_use_libra%22%3A1%2C%22mt_search_general_user_live_card%22%3A1%7D%7D%2C%22search_server%22%3A%7B%7D%7D%7D&webcast_language=en&msToken=e3f6V5h6K5R_Ak1M7_YpbE8NR2axbiarlzT9Zaem3M7rn_eV8NW0TGAaXc5AdOB7VqjVAukBONqP-6pSKtDvxJVBLwA2wOs53XBYjyEadKCFHIrz5Z8BSElYDt7yk6ishfDt52b6FeBUAoomLtVo4_WK&X-Bogus=DFSzswVOrLvAN9Wkt8fhpfLNKBTT&_signature=_02B4Z6wo00001XTdU-QAAIDCJiJz.uY7IL103VdAADpL82"

    all_results = []
    for hashtag in hashtags:
        # Replace the placeholder with the current hashtag
        url = base_url.replace("{keyword}", hashtag)
        print(f"Fetching videos {url}")
        response = open_chrome_and_copy_text(url)
        all_results.extend(json.loads(response)["data"])


    return all_results

# Function to fetch trending videos
def fetch_trending_videos():
    url = "https://www.tiktok.com/api/explore/item_list/?WebIdLastTime=1714615161&aid=1988&app_language=en&browser_language=en-US&browser_name=Mozilla&browser_online=true&browser_platform=MacIntel&browser_version=5.0%20%28Macintosh%3B%20Intel%20Mac%20OS%20X%2010_15_7%29%20AppleWebKit%2F537.36%20%28KHTML,%20like%20Gecko%29%20Chrome/131.0.0.0%20Safari/537.36&categoryType=120&channel=tiktok_web&clientABVersions=70508271%2C72437276%2C72920973%2C72923695%2C72961679%2C73006923%2C73022009%2C73038833%2C73054612%2C73060926%2C73067877%2C73119040%2C73121375%2C73122400%2C73133543%2C73149839%2C73158100%2C73167672%2C73174522%2C73179190%2C73181847%2C73184450%2C73184712%2C73195685%2C73197619%2C73198007%2C73204428%2C73216054%2C73230561%2C73234258%2C50070521%2C50077909%2C50089479%2C70405643%2C70772958%2C71057832%2C71200802%2C71381811%2C71516509%2C71803300%2C71962127%2C72267504%2C72360691%2C72361743%2C72408100%2C72854054%2C72892778%2C73171280%2C73208420%2C73233984&cookie_enabled=true&count=16&data_collection_enabled=true&device_id=7364215944284522026&device_platform=web_pc&focus_state=true&from_page=&history_len=8&is_fullscreen=false&is_page_visible=true&language=en&odinId=6954213178439959557&os=mac&priority_region=US&referer=&region=US"

    result = subprocess.run(
        ["curl", "-X", "GET", url],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if result.returncode != 0:
        raise Exception(f"Error fetching trending videos: {result.stderr}")

    return json.loads(result.stdout)["itemList"]

# Function to get a presigned URL for uploading to S3
def get_presigned_url(file_name, content_type):
    print(f"Getting presigned URL for {file_name}")
    response = requests.get(f"{S3_API_URL}/getPresignedUrl?fileName={file_name}&contentType={content_type}")
    response.raise_for_status()
    return response.json()["url"]

# Function to upload video to S3
def upload_video(file_path, presigned_url):
    print(f"Uploading video to S3: {file_path}")
    with open(file_path, "rb") as f:
        response = requests.put(presigned_url, data=f, headers={"Content-Type": "video/mp4"})
        if not response.ok:
            raise Exception(f"Failed to upload video to S3: {response.text}")

# Function to handle video submission
def submit_media(file_path, description, hashtags, mute_by_default):
    cropped_file_path = crop_video(file_path)

    file_name = os.path.basename(cropped_file_path)
    presigned_url = get_presigned_url(file_name, "video/mp4")

    upload_video(cropped_file_path, presigned_url)

    metadata = {
        "videoId": presigned_url.split("?")[0].split("/")[-1],
        "description": description,
        "hashtags": hashtags,
        "muteByDefault": mute_by_default,
        "uploadedAt": datetime.now().isoformat(),
    }
    print(f"Uploading metadata: {metadata}")

    response = requests.post(
        CREATE_VIDEO_METADATA_URL,
        json=metadata,
        headers={"Content-Type": "application/json"}
    )
    response.raise_for_status()
    print(f"Finished uploading video: {file_path}")

# Click command-line interface
@click.group()
def cli():
    pass

@click.command()
@click.option("--mute-by-default", is_flag=True, help="Mute videos by default when uploading metadata.")
def upload_trending_videos(mute_by_default):
    videos = fetch_trending_videos()
    print(f"Found {len(videos)} trending videos.")
    for video_info in videos:
        description = video_info.get("desc", "")
        hashtags = [tag["hashtagName"] for tag in video_info.get("textExtra", []) if "hashtagName" in tag]
        file_path = download_video_ssstik(video_info, "trending")
        print(f"{description=}, {hashtags=}, {file_path=}")
        submit_media(file_path, description, hashtags, mute_by_default)

@click.command()
@click.option("--hashtags", multiple=True, help="List of hashtags to fetch videos for.")
@click.option("--mute-by-default", is_flag=True, help="Mute videos by default when uploading metadata.")
def upload_videos_by_hashtags(hashtags, mute_by_default):
    videos = get_videos_by_hashtags(hashtags)
    for i, video_info in enumerate(videos):
        try:
            video_info = video_info["item"]
            description = video_info.get("desc", "")
            hashtags = [tag["hashtagName"] for tag in video_info.get("textExtra", []) if "hashtagName" in tag]
            print(f"{description=}, {hashtags=}")
            file_path = download_video_ssstik(video_info, "hashtags")
            submit_media(file_path, description, hashtags, mute_by_default)
        except Exception as e:
            print(f"Completed {i} videos, error: {e}")
            break

cli.add_command(upload_trending_videos)
cli.add_command(upload_videos_by_hashtags)

if __name__ == "__main__":
    cli()
