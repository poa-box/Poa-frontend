/**
 * ProfileEditor
 * Edit form for user profile metadata (bio, avatar, GitHub, website).
 * Handles IPFS upload + on-chain setProfileMetadata for both EOA and passkey users.
 */

import React, { useState, useEffect } from 'react';
import {
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Button,
  Text,
  Alert,
  AlertIcon,
  Spinner,
  Divider,
  useToast,
} from '@chakra-ui/react';
import { useProfileUpdate } from '@/hooks/useProfileUpdate';
import { useRefreshEmit } from '@/context/RefreshContext';
import AvatarUpload from '@/components/account/AvatarUpload';

const STEP_LABELS = {
  idle: '',
  uploading: 'Uploading to IPFS...',
  building: 'Building transaction...',
  signing: 'Sign to confirm...',
  submitting: 'Submitting...',
  confirming: 'Confirming on chain...',
  success: 'Profile updated!',
  error: 'Something went wrong.',
};

const ProfileEditor = ({ currentMetadata, onSuccess }) => {
  const toast = useToast();
  const { updateProfile, isUpdating, error, step, reset } = useProfileUpdate();
  const { emit } = useRefreshEmit();

  const [bio, setBio] = useState('');
  const [github, setGithub] = useState('');
  const [twitter, setTwitter] = useState('');
  const [website, setWebsite] = useState('');
  const [avatarCid, setAvatarCid] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);

  // Initialize form with current metadata
  useEffect(() => {
    if (currentMetadata) {
      setBio(currentMetadata.bio || '');
      setGithub(currentMetadata.github || '');
      setTwitter(currentMetadata.twitter || '');
      setWebsite(currentMetadata.website || '');
      setAvatarCid(currentMetadata.avatar || '');
      setAvatarPreview(null);
    }
  }, [currentMetadata]);

  const handleSubmit = async () => {
    try {
      const profileData = {};
      if (bio.trim()) profileData.bio = bio.trim();
      if (avatarCid) profileData.avatar = avatarCid;
      if (github.trim()) profileData.github = github.trim();
      if (twitter.trim()) profileData.twitter = twitter.trim();
      if (website.trim()) profileData.website = website.trim();

      const txHash = await updateProfile(profileData);

      toast({
        title: 'Profile updated',
        description: 'Your profile has been saved on-chain.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      if (emit) {
        emit('user:profile_updated', { transactionHash: txHash });
      }
      if (onSuccess) onSuccess();
    } catch (err) {
      toast({
        title: 'Profile update failed',
        description: err.message || 'Unknown error',
        status: 'error',
        duration: 8000,
        isClosable: true,
      });
    }
  };

  const hasChanges = (
    (bio.trim() || '') !== (currentMetadata?.bio || '') ||
    (avatarCid || '') !== (currentMetadata?.avatar || '') ||
    (github.trim() || '') !== (currentMetadata?.github || '') ||
    (twitter.trim() || '') !== (currentMetadata?.twitter || '') ||
    (website.trim() || '') !== (currentMetadata?.website || '')
  );

  return (
    <VStack spacing={4} align="stretch">
      <VStack spacing={2}>
        <AvatarUpload
          avatarCid={avatarCid}
          localPreview={avatarPreview}
          onUpload={(cid, preview) => { setAvatarCid(cid); setAvatarPreview(preview); }}
          onRemove={() => { setAvatarCid(''); setAvatarPreview(null); }}
          isDisabled={isUpdating}
        />
      </VStack>

      <Divider borderColor="whiteAlpha.200" />

      <FormControl>
        <FormLabel fontSize="sm" color="gray.400">Bio</FormLabel>
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself..."
          maxLength={280}
          rows={3}
          isDisabled={isUpdating}
        />
        <Text fontSize="xs" color="gray.500" mt={1}>{bio.length}/280</Text>
      </FormControl>

      <FormControl>
        <FormLabel fontSize="sm" color="gray.400">GitHub</FormLabel>
        <Input
          value={github}
          onChange={(e) => setGithub(e.target.value)}
          placeholder="username"
          isDisabled={isUpdating}
        />
      </FormControl>

      <FormControl>
        <FormLabel fontSize="sm" color="gray.400">Twitter / X</FormLabel>
        <Input
          value={twitter}
          onChange={(e) => setTwitter(e.target.value)}
          placeholder="@username"
          isDisabled={isUpdating}
        />
      </FormControl>

      <FormControl>
        <FormLabel fontSize="sm" color="gray.400">Website</FormLabel>
        <Input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://..."
          isDisabled={isUpdating}
        />
      </FormControl>

      {error && (
        <Alert status="error" borderRadius="md" fontSize="sm">
          <AlertIcon />
          {error.message || 'Failed to update profile'}
        </Alert>
      )}

      {isUpdating && step !== 'idle' && (
        <HStack spacing={2}>
          <Spinner size="sm" color="purple.400" />
          <Text fontSize="sm" color="gray.400">{STEP_LABELS[step]}</Text>
        </HStack>
      )}

      <Button
        colorScheme="purple"
        onClick={handleSubmit}
        isLoading={isUpdating}
        loadingText="Saving..."
        isDisabled={!hasChanges || isUpdating}
        size="md"
      >
        Save Profile
      </Button>
    </VStack>
  );
};

export default ProfileEditor;
