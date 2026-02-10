from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.services import users

router = APIRouter(tags=["users"])


@router.get("")
def list_users(db: Session = Depends(get_db)):
    all_users = users.get_all(db)
    return [{
        "id": u.id,
        "phone": u.phone,
        "name": u.name,
        "gender": u.gender.value,
        "metadata": u.metadata_,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None
    } for u in all_users]


@router.get("/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(users.User).filter(users.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "phone": user.phone,
        "name": user.name,
        "gender": user.gender.value,
        "metadata": user.metadata_,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None
    }


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    from backend.models.user import User
    from backend.models.conversation import Conversation
    from backend.models.message import Message
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    convs = db.query(Conversation).filter(Conversation.user_id == user_id).all()
    for conv in convs:
        db.query(Message).filter(Message.conversation_id == conv.id).delete()
    db.query(Conversation).filter(Conversation.user_id == user_id).delete()
    
    db.delete(user)
    db.commit()
    return {"status": "deleted"}
