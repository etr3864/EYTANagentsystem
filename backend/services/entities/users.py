from sqlalchemy.orm import Session
from backend.models.user import User, Gender


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def get_by_phone(db: Session, phone: str) -> User | None:
    return db.query(User).filter(User.phone == phone).first()


def get_or_create(db: Session, phone: str, name: str | None = None) -> User:
    user = get_by_phone(db, phone)
    if user:
        if name and not user.name:
            user.name = name
            db.commit()
        return user
    
    user = User(phone=phone, name=name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update(db: Session, user_id: int, **kwargs) -> User | None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    
    for key, value in kwargs.items():
        if key == "gender" and isinstance(value, str):
            value = Gender(value) if value in [g.value for g in Gender] else Gender.UNKNOWN
        if hasattr(user, key) and value is not None:
            setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    return user


def update_metadata(db: Session, user_id: int, key: str, value) -> User | None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    
    metadata = user.metadata_ or {}
    metadata[key] = value
    user.metadata_ = metadata
    
    db.commit()
    db.refresh(user)
    return user


def get_all(db: Session) -> list[User]:
    return db.query(User).all()
