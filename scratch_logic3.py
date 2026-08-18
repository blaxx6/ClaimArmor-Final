import os
import sys
import time
sys.path.append(os.path.abspath('.'))

from app import db
from sqlalchemy import select, func

engine = db._engine()
with engine.connect() as conn:
    res = conn.execute(select(db.investigations_table.c.claim_id, db.investigations_table.c.updated_at)).all()
    print("Investigations:")
    for row in res:
        print(row)
        
    res2 = conn.execute(select(db.reviews_table.c.claim_id, db.reviews_table.c.created_at)).all()
    print("Reviews:")
    for row in res2:
        print(row)
