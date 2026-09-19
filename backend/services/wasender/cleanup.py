from sqlalchemy.orm import Session

from backend.core.logger import log, log_error
from backend.models.agent_channel import AgentChannel
from backend.models.channel_user import ChannelUser
from backend.services.media.storage import delete_profile_pic
from backend.services.messaging import buffer
from backend.services.messaging.split.leftover import clear as clear_leftover
from backend.services.wasender import live


async def wipe_channel_runtime(db: Session, channel: AgentChannel) -> None:
    phones = [
        row.external_id
        for row in db.query(ChannelUser).filter(ChannelUser.channel_id == channel.id).all()
        if row.external_id
    ]
    user_ids = [
        row.id
        for row in db.query(ChannelUser).filter(ChannelUser.channel_id == channel.id).all()
    ]
    for user_id in user_ids:
        try:
            delete_profile_pic(user_id)
        except Exception as error:
            log_error("wasender_cleanup", f"pic {user_id}: {str(error)[:60]}")
    r = await buffer.redis_client()
    if r is not None:
        keys: list[str] = []
        for phone in phones:
            keys.extend(
                [
                    f"msg_buffer:{channel.agent_id}:{phone}",
                    f"msg_lock:{channel.agent_id}:{phone}",
                    f"msg_gen:{channel.agent_id}:{phone}",
                    f"split_leftover:{channel.agent_id}:{phone}",
                    f"wa:pic_attempt:{phone}",
                ]
            )
        for user_id in user_ids:
            keys.append(f"wa:pic_attempt:{user_id}")
        if keys:
            await r.delete(*keys)
    for phone in phones:
        await clear_leftover(channel.agent_id, phone)
    await live.clear(channel.id)
    log("wasender_dbg", op="cleanup", channel_id=channel.id, phones=len(phones))
