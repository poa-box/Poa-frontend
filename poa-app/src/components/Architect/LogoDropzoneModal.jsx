import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Box,
  Text,
  VStack,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from "@chakra-ui/react";
import { useIPFScontext } from "@/context/ipfsContext";
import {
  validateImageFile,
  MAX_LOGO_SIZE_BYTES,
  ACCEPTED_IMAGE_MIME,
} from "@/util/imageUpload";

const LogoDropzoneModal = ({ isOpen, onSave, onClose }) => {
  const [uploadStatus, setUploadStatus] = useState(null); // null, 'success', or 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const { addToIpfs } = useIPFScontext();

  const { getRootProps, getInputProps } = useDropzone({
    accept: ACCEPTED_IMAGE_MIME,
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;

      const check = validateImageFile(file, MAX_LOGO_SIZE_BYTES);
      if (!check.valid) {
        setErrorMessage(check.error);
        setUploadStatus("error");
        return;
      }

      try {
        const addedData = await addToIpfs(file);
        const ipfsUrl = `${addedData.path}`;
        onSave(ipfsUrl);
        setErrorMessage(null);
        setUploadStatus("success");
      } catch (error) {
        console.error("Error uploading logo to IPFS:", error);
        setErrorMessage("There was an issue with the file upload.");
        setUploadStatus("error");
      }
    },
  });

  const resetUploadStatus = () => {
    setUploadStatus(null);
    setErrorMessage(null);
    if (typeof onClose === "function") {
      onClose(); // Close the modal
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={resetUploadStatus}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Upload Image</ModalHeader>
        <ModalBody>
          <Box
            {...getRootProps()}
            borderWidth="2px"
            borderStyle="dashed"
            rounded="md"
            p={5}
            cursor="pointer"
          >
            <input {...getInputProps()} />
            <VStack spacing={2}>
              <Text>
                Drag 'n' drop some files here, or click to select files
              </Text>
              <Text fontSize="sm" color="gray.500">
                PNG, JPG, GIF, WebP — up to 2MB
              </Text>
            </VStack>
          </Box>
          {uploadStatus === "success" && (
            <Alert status="success" mt={4}>
              <AlertIcon />
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>Your file has been uploaded.</AlertDescription>
            </Alert>
          )}
          {uploadStatus === "error" && (
            <Alert status="error" mt={4}>
              <AlertIcon />
              <AlertTitle>Error!</AlertTitle>
              <AlertDescription>
                {errorMessage || "There was an issue with the file upload."}
              </AlertDescription>
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={resetUploadStatus}>
            {uploadStatus ? "Close" : "Cancel"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default LogoDropzoneModal;
