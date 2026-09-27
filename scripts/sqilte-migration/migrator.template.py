import os

from dotenv import load_dotenv
from cloudflare import Cloudflare

load_dotenv()

ACCOUNT_ID = os.environ["CLOUDFLARE_ID"]
DATABASE_ID = os.environ["DATABASE_ID"]
API_TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]

# use these env if needed:
# DATABASE_NAME
# CLOUDFLARE_ID
# CLOUDFLARE_API_TOKEN
# CLOUDFLARE_ACCESS
# CLOUDFLARE_SECRET
# CLOUDFLARE_S3_URI

client = Cloudflare(
    api_token=API_TOKEN,
)


def query(sql: str, params=None):
    response = client.d1.database.query(
        database_id=DATABASE_ID,
        account_id=ACCOUNT_ID,
        sql=sql,
        params=params or [],
    )

    return response


if __name__ == "__main__":
    result = query("SELECT 1 AS connected;")

    for item in result:
        print(item)