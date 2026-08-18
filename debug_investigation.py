#!/usr/bin/env python3
"""Debug script to trace investigation -> review queue flow."""

import sys
import traceback
import json

def main():
    try:
        from app import db
        db.init_db()
        
        # 1. List claims
        claims = db.list_claims()
        print(f"[1] Total claims: {len(claims)}", flush=True)
        
        if not claims:
            print("No claims found, cannot test", flush=True)
            return
        
        claim = claims[0]
        claim_id = claim['claim_id']
        print(f"[2] Testing with claim: {claim_id}", flush=True)
        
        # 2. Check investigation before
        inv_before = db.get_investigation(claim_id)
        print(f"[3] Investigation before: {'exists' if inv_before else 'none'}", flush=True)
        if inv_before:
            print(f"    route={inv_before.get('route')}", flush=True)
        
        # 3. Run investigation
        print("[4] Running investigation...", flush=True)
        from app.services.pipeline import investigate
        result = investigate(claim)
        print(f"[5] Result: route={result.route}, confidence={result.confidence:.3f}", flush=True)
        
        # 4. Check that _finalize saved it
        inv_after = db.get_investigation(claim_id)
        print(f"[6] Investigation after _finalize: {'exists' if inv_after else 'MISSING!'}", flush=True)
        if inv_after:
            print(f"    route={inv_after.get('route')}", flush=True)
        
        # 5. Now simulate what the router endpoint does (save again)
        result_dict = result.model_dump(mode='json')
        db.put_investigation(claim_id, result_dict)
        print("[7] Router saved investigation again", flush=True)
        
        inv_after2 = db.get_investigation(claim_id)
        print(f"[8] Investigation after router save: {'exists' if inv_after2 else 'MISSING!'}", flush=True)
        if inv_after2:
            print(f"    route={inv_after2.get('route')}", flush=True)
        
        # 6. Check investigations list
        all_inv = db.list_investigations()
        print(f"\n[9] All investigations: {len(all_inv)}", flush=True)
        for inv in all_inv:
            print(f"    claim_id={inv.get('claim_id')}, route={inv.get('route')}", flush=True)
        
        # 7. Check review queue
        pending = db.list_pending_reviews()
        print(f"\n[10] Pending reviews: {len(pending)}", flush=True)
        for p in pending:
            print(f"    claim_id={p.get('claim_id')}, route={p.get('route')}", flush=True)
        
        # 8. Check if the claim appears in pending when it should
        route = result_dict.get('route')
        should_be_pending = route in ['HOLD', 'HUMAN_REVIEW', 'UNDETERMINED']
        is_in_pending = any(p.get('claim_id') == claim_id for p in pending)
        print(f"\n[11] Route: {route}", flush=True)
        print(f"    Should be in pending: {should_be_pending}", flush=True)
        print(f"    Is in pending: {is_in_pending}", flush=True)
        
        if should_be_pending and not is_in_pending:
            print("    *** BUG: Should be in pending but isn't! ***", flush=True)
        elif not should_be_pending and not is_in_pending:
            print("    OK: Route is CLEAR, not expected in pending", flush=True)
        else:
            print("    OK: Correctly appears in pending", flush=True)
    
    except Exception as e:
        print(f"ERROR: {e}", flush=True)
        traceback.print_exc()

if __name__ == "__main__":
    main()
