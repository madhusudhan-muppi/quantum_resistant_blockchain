import React, { createContext, useContext, useRef, useState, useCallback, useMemo } from 'react';
import { FabricNetwork, AnchorRegistry, CHAIN_ID_HARDHAT } from './ledger.js';
import { ipfs } from './ipfs.js';
import { generateIdentity } from './crypto.js';

export const StoreContext = createContext(null);

/**
 * Holds the long-lived simulation objects. They are mutable class instances,
 * so a version counter forces re-render rather than cloning state on every
 * ledger write.
 */
export function StoreProvider({ children }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const fabric = useRef(null);
  const anchor = useRef(null);
  const identities = useRef([]);
  const [booted, setBooted] = useState(false);
  const [bootMessage, setBootMessage] = useState('');

  const [toasts, setToasts] = useState([]);
  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  /**
   * Key generation is the slow part (ML-DSA keygen plus two identities), so it
   * runs once, lazily, with progress reported to the UI.
   */
  const boot = useCallback(async () => {
    if (fabric.current) return;

    setBootMessage('Provisioning Fabric channel "mlops"…');
    await new Promise((r) => setTimeout(r, 120));
    fabric.current = new FabricNetwork();
    anchor.current = new AnchorRegistry(CHAIN_ID_HARDHAT);

    setBootMessage('Generating ML-DSA-65 keypair for Acme AI Labs…');
    await new Promise((r) => setTimeout(r, 40));
    const acme = generateIdentity('Acme AI Labs');
    acme.ethAddress = '0x' + acme.pkHashHex.slice(0, 40);

    setBootMessage('Generating ML-DSA-65 keypair for Northwind Research…');
    await new Promise((r) => setTimeout(r, 40));
    const northwind = generateIdentity('Northwind Research');
    northwind.ethAddress = '0x' + northwind.pkHashHex.slice(0, 40);

    setBootMessage('Generating an unenrolled adversary identity…');
    await new Promise((r) => setTimeout(r, 40));
    const rogue = generateIdentity('Unknown Publisher');
    rogue.ethAddress = '0x' + rogue.pkHashHex.slice(0, 40);
    rogue.rogue = true;

    identities.current = [acme, northwind, rogue];

    // Only the first two are enrolled in an MSP and added as publishers.
    fabric.current.msp.enroll(acme, 'Org1MSP');
    fabric.current.msp.enroll(northwind, 'Org2MSP');
    anchor.current.addPublisher(acme.ethAddress, acme.label);
    anchor.current.addPublisher(northwind.ethAddress, northwind.label);

    setBootMessage('');
    setBooted(true);
    bump();
  }, [bump]);

  const value = useMemo(
    () => ({
      version,
      bump,
      booted,
      bootMessage,
      boot,
      toast,
      toasts,
      get fabric() {
        return fabric.current;
      },
      get anchor() {
        return anchor.current;
      },
      get identities() {
        return identities.current;
      },
      ipfs,
    }),
    [version, bump, booted, bootMessage, boot, toast, toasts]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
